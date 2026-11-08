import { apiResponseService } from "@/services/api-response/service";
import { HttpStatusCode } from "@/services/api-response/types";
import type {
	MiddlewareContext,
	MiddlewareHandler,
	RouteHandler,
} from "../types";

export interface RateLimitConfig {
	/** Burst capacity, and the steady-state max requests allowed per `windowMs`. */
	limit: number;
	/** Time to fully refill `limit` tokens, in milliseconds. */
	windowMs: number;
}

/**
 * Token bucket, not fixed-window: a fixed window lets a client burst up to
 * `2 * limit` requests right at a window boundary (the last instant of one
 * window plus the first instant of the next). A token bucket refills
 * continuously instead of resetting in steps, so the steady-state rate is
 * the same but there's no boundary to exploit.
 */
interface Bucket {
	/** Tokens currently available, between `0` and `config.limit`. */
	tokens: number;
	lastRefillAt: number;
}

/**
 * In-memory, per-process bucket store. Fine for local dev and a single
 * instance; a multi-instance production deployment needs a shared store
 * (e.g. Postgres or Redis) instead — swap this `Map` for that without
 * touching `createRateLimitMiddleware()`/`withRateLimit()`'s signatures.
 *
 * `sweepIdleBuckets()` below keeps this from growing without bound under
 * real traffic — without it, every distinct key (IP + path) would leave a
 * permanent entry and eventually exhaust memory on its own.
 */
const buckets = new Map<string, Bucket>();

const IDLE_EVICTION_MS = 10 * 60_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;

function sweepIdleBuckets(): void {
	const now = Date.now();
	for (const [key, bucket] of buckets) {
		if (now - bucket.lastRefillAt > IDLE_EVICTION_MS) buckets.delete(key);
	}
}

// A bucket idle longer than IDLE_EVICTION_MS is already back at full capacity
// (refill always catches up to the cap), so dropping it loses no state —
// the next request just recreates it at `tokens: config.limit`, identical
// to where it would be anyway.
const sweepTimer = setInterval(sweepIdleBuckets, SWEEP_INTERVAL_MS);
sweepTimer.unref?.();

function getClientIp(request: MiddlewareContext["request"]): string {
	const forwardedFor = request.headers.get("x-forwarded-for");
	if (forwardedFor) return forwardedFor.split(",")[0].trim();

	return request.headers.get("x-real-ip") ?? "unknown";
}

/** The one place both call sites below touch the bucket store. */
function checkRateLimit(
	key: string,
	config: RateLimitConfig,
): { limited: boolean; retryAfterSeconds: number } {
	const now = Date.now();
	const refillRatePerMs = config.limit / config.windowMs;

	let bucket = buckets.get(key);
	if (!bucket) {
		bucket = { tokens: config.limit, lastRefillAt: now };
		buckets.set(key, bucket);
	} else {
		const elapsedMs = now - bucket.lastRefillAt;
		bucket.tokens = Math.min(
			config.limit,
			bucket.tokens + elapsedMs * refillRatePerMs,
		);
		bucket.lastRefillAt = now;
	}

	if (bucket.tokens < 1) {
		const msUntilNextToken = (1 - bucket.tokens) / refillRatePerMs;
		return {
			limited: true,
			retryAfterSeconds: Math.ceil(msUntilNextToken / 1000),
		};
	}

	bucket.tokens -= 1;
	return { limited: false, retryAfterSeconds: 0 };
}

function rateLimitedResponse(retryAfterSeconds: number, config: RateLimitConfig) {
	const response = apiResponseService.error({
		status: HttpStatusCode.TOO_MANY_REQUESTS,
		code: "RATE_LIMITED",
		details: { limit: config.limit, windowMs: config.windowMs },
	});
	response.headers.set("Retry-After", String(retryAfterSeconds));
	return response;
}

/**
 * Global use: one handler plugged into `middleware/index.ts`'s pipeline and
 * run from `proxy.ts` for every request its matcher covers. Pick the config
 * via `registry.ts`'s `resolveRateLimitConfig()`.
 */
export function createRateLimitMiddleware(
	config: RateLimitConfig,
): MiddlewareHandler {
	return ({ request }) => {
		const key = `${getClientIp(request)}:${request.nextUrl.pathname}`;
		const { limited, retryAfterSeconds } = checkRateLimit(key, config);
		return limited ? rateLimitedResponse(retryAfterSeconds, config) : undefined;
	};
}

/**
 * Per-route use: wraps one `route.ts` handler directly, for a route
 * `proxy.ts`'s matcher doesn't cover globally. Drop-in — keeps whatever
 * `context` (e.g. dynamic `params`) the wrapped handler expects.
 *
 * @example
 * // app/api/auth/login/route.ts
 * import { withRateLimit } from "@/middleware/rate-limit";
 *
 * async function handlePost(request: NextRequest) { ... }
 *
 * export const POST = withRateLimit(handlePost, { limit: 5, windowMs: 60_000 });
 *
 * @example
 * // a dynamic route — context.params flows through untouched
 * async function handleGet(
 *   request: NextRequest,
 *   context: { params: Promise<{ id: string }> },
 * ) { ... }
 *
 * export const GET = withRateLimit(handleGet, { limit: 20, windowMs: 60_000 });
 */
export function withRateLimit<Context>(
	handler: RouteHandler<Context>,
	config: RateLimitConfig,
): RouteHandler<Context> {
	return async (request, context) => {
		const key = `${getClientIp(request)}:${request.nextUrl.pathname}`;
		const { limited, retryAfterSeconds } = checkRateLimit(key, config);

		if (limited) return rateLimitedResponse(retryAfterSeconds, config);
		return handler(request, context);
	};
}
