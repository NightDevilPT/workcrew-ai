import type { NextRequest, NextResponse } from "next/server";
import { createRateLimitMiddleware } from "./rate-limit";
import { resolveRateLimitConfig } from "./registry";
import type { MiddlewareHandler } from "./types";

/** Runs `handlers` in order; the first to return a response wins and the rest are skipped. */
function composeMiddleware(handlers: MiddlewareHandler[]) {
	return async (request: NextRequest): Promise<NextResponse | undefined> => {
		for (const handler of handlers) {
			const result = await handler({ request });
			if (result) return result;
		}
		return undefined;
	};
}

/**
 * The full proxy pipeline, run once per request by `proxy.ts` at the
 * project root. Add a new middleware by building it as one file here
 * (see `rate-limit.ts` for the shape) and including it in the list below —
 * `proxy.ts` itself never needs to change.
 */
export async function runMiddleware(
	request: NextRequest,
): Promise<NextResponse | undefined> {
	const rateLimitConfig = resolveRateLimitConfig(request.nextUrl.pathname);

	const pipeline = composeMiddleware([
		createRateLimitMiddleware(rateLimitConfig),
		// Add more middleware here, e.g. createAuthMiddleware(), createLoggingMiddleware().
	]);

	return pipeline(request);
}
