import { NextRequest } from "next/server";
import {
	getRunnerAdapter,
	type RunnerProvider,
} from "@/services/sandbox/sandbox.service";
import type { SandboxLanguage } from "@/services/sandbox/sandbox.types";
import { apiResponseService } from "@/services/api-response/service";
import { HttpStatusCode } from "@/services/api-response/types";

const RUNNER_PROVIDERS: RunnerProvider[] = ["vercel", "docker-local"];

/**
 * Some adapters (currently only `docker-local`) expose a stronger teardown
 * than the shared `RunnerAdapter.cleanup()` — see
 * `DockerLocalRunnerAdapter.removeSandbox()`. Vercel Sandbox has no
 * equivalent to implement, since `sandbox.stop()` already leaves nothing
 * local behind. Duck-typed rather than an `instanceof` check, so this keeps
 * working if another adapter later adds the same capability.
 */
interface RemovableRunnerAdapter {
	removeSandbox(): Promise<void>;
}

function hasRemoveSandbox(
	adapter: unknown,
): adapter is RemovableRunnerAdapter {
	return (
		typeof adapter === "object" &&
		adapter !== null &&
		typeof (adapter as RemovableRunnerAdapter).removeSandbox === "function"
	);
}

interface DemoSandboxRunBody {
	command?: string;
	args?: string[];
	language?: SandboxLanguage;
	/** Which Runner Adapter to use — defaults to `RUNNER_PROVIDER` env, then `"vercel"`. */
	provider?: RunnerProvider;
}

/**
 * POST /api/demo-sandbox - Testing endpoint for the Runner Adapter (services/sandbox).
 * Runs one command in a fresh sandbox and returns its output, plus which
 * provider actually ran it, so the adapter being used can be verified.
 * Demo/testing only.
 */
export async function POST(request: NextRequest) {
	const startedAt = apiResponseService.startTimer();
	const body = (await request.json()) as DemoSandboxRunBody;

	if (typeof body.command !== "string" || body.command.trim().length === 0) {
		return apiResponseService.error({
			status: HttpStatusCode.BAD_REQUEST,
			code: "VALIDATION_ERROR",
			message: "`command` is required and must be a non-empty string",
			startedAt,
		});
	}

	const resolvedProvider: RunnerProvider =
		body.provider ??
		((process.env.RUNNER_PROVIDER as RunnerProvider | undefined) ?? "vercel");

	if (!RUNNER_PROVIDERS.includes(resolvedProvider)) {
		return apiResponseService.error({
			status: HttpStatusCode.BAD_REQUEST,
			code: "VALIDATION_ERROR",
			message: `\`provider\` must be one of: ${RUNNER_PROVIDERS.join(", ")}`,
			startedAt,
		});
	}

	const adapter = getRunnerAdapter(resolvedProvider);

	try {
		await adapter.prepare({ language: body.language });
		const result = await adapter.execute({
			command: body.command,
			args: body.args,
		});
		return apiResponseService.success(
			{ provider: resolvedProvider, ...result },
			{ startedAt },
		);
	} catch (error) {
		return apiResponseService.error({
			status: HttpStatusCode.INTERNAL_SERVER_ERROR,
			code: "SANDBOX_EXECUTION_FAILED",
			message:
				error instanceof Error ? error.message : "Sandbox execution failed",
			details: { provider: resolvedProvider },
			startedAt,
		});
	} finally {
		if (hasRemoveSandbox(adapter)) {
			await adapter.removeSandbox();
		} else {
			await adapter.cleanup();
		}
	}
}
