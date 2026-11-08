import type { NextRequest, NextResponse } from "next/server";

export interface MiddlewareContext {
	request: NextRequest;
}

/**
 * One piece of global proxy logic, run from `middleware/index.ts` for every
 * request `proxy.ts`'s matcher covers. Return a `NextResponse` to short-circuit
 * the pipeline (e.g. a 429/401) — `runMiddleware()` stops at the first handler
 * that returns one. Return `undefined` to let the next handler run.
 */
export type MiddlewareHandler = (
	context: MiddlewareContext,
) => Promise<NextResponse | undefined> | NextResponse | undefined;

/**
 * Shape of a Next.js Route Handler (`GET`/`POST`/etc. exported from a
 * `route.ts`), generic over `context` so each route keeps its own
 * `{ params: Promise<...> }` typing for dynamic segments.
 *
 * A middleware that isn't applied globally via `proxy.ts` instead exports a
 * `with<Name>(handler, config)` wrapper typed against this — see
 * `rate-limit/index.ts`'s `withRateLimit()` for the pattern. The wrapper
 * must stay a drop-in replacement for the handler it wraps, so routes using
 * it don't need any other change.
 */
export type RouteHandler<Context = unknown> = (
	request: NextRequest,
	context: Context,
) => Promise<Response> | Response;
