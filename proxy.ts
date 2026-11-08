import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runMiddleware } from "./middleware";

/**
 * Next.js 16 entry point (formerly `middleware.ts` — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 * Only one `proxy.ts` is supported per project, so this file stays a thin
 * delegate to `middleware/` — all actual logic lives there.
 */
export async function proxy(request: NextRequest) {
	const result = await runMiddleware(request);
	return result ?? NextResponse.next();
}

export const config = {
	matcher: ["/api/:path*"],
};
