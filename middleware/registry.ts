import type { RateLimitConfig } from "./rate-limit";

/** Global default rate limit — applied to any route with no entry below. */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
	limit: 100,
	windowMs: 60_000,
};

interface RouteMiddlewareConfig {
	/** Route prefix this entry applies to, matched with `pathname.startsWith()`. */
	pathPrefix: string;
	rateLimit: RateLimitConfig;
}

/**
 * Per-route overrides of the global default. Add one entry per route that
 * needs its own limit — e.g. login gets a tight limit to slow brute-forcing,
 * a read-only list endpoint might get a looser one.
 *
 * The longest matching `pathPrefix` wins, so a specific route (`/api/auth/login`)
 * always beats a broader one (`/api/auth`) without needing any ordering care.
 */
export const ROUTE_MIDDLEWARE_CONFIG: RouteMiddlewareConfig[] = [
	// Add more route-specific overrides here as new routes need their own limits.
];

/** Resolves the `RateLimitConfig` that applies to `pathname` — a route-specific override, or `DEFAULT_RATE_LIMIT`. */
export function resolveRateLimitConfig(pathname: string): RateLimitConfig {
	const match = ROUTE_MIDDLEWARE_CONFIG.filter((entry) =>
		pathname.startsWith(entry.pathPrefix),
	).sort((a, b) => b.pathPrefix.length - a.pathPrefix.length)[0];

	return match?.rateLimit ?? DEFAULT_RATE_LIMIT;
}
