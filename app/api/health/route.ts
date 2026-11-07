import { apiResponseService } from "@/services/api-response/service";

/**
 * GET /api/health - Lightweight liveness check for the API itself.
 * `meta.responseTimeMs` on the response is how long the API took to answer, in ms.
 */
export async function GET() {
	const startedAt = apiResponseService.startTimer();

	return apiResponseService.success(
		{
			status: "healthy" as const,
			uptime: process.uptime(),
		},
		{ startedAt },
	);
}
