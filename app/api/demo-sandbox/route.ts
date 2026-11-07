import { NextRequest, NextResponse } from "next/server";
import {
	getRunnerAdapter,
	type RunnerProvider,
} from "@/services/sandbox/sandbox.service";
import type { SandboxLanguage } from "@/services/sandbox/sandbox.types";

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
	const body = (await request.json()) as DemoSandboxRunBody;

	if (typeof body.command !== "string" || body.command.trim().length === 0) {
		return NextResponse.json(
			{ error: "`command` is required and must be a non-empty string" },
			{ status: 400 },
		);
	}

	const resolvedProvider: RunnerProvider =
		body.provider ??
		((process.env.RUNNER_PROVIDER as RunnerProvider | undefined) ?? "vercel");

	if (!RUNNER_PROVIDERS.includes(resolvedProvider)) {
		return NextResponse.json(
			{
				error: `\`provider\` must be one of: ${RUNNER_PROVIDERS.join(", ")}`,
			},
			{ status: 400 },
		);
	}

	const adapter = getRunnerAdapter(resolvedProvider);

	try {
		await adapter.prepare({ language: body.language });
		const result = await adapter.execute({
			command: body.command,
			args: body.args,
		});
		return NextResponse.json({ provider: resolvedProvider, ...result });
	} catch (error) {
		return NextResponse.json(
			{
				provider: resolvedProvider,
				error:
					error instanceof Error ? error.message : "Sandbox execution failed",
			},
			{ status: 500 },
		);
	} finally {
		if (hasRemoveSandbox(adapter)) {
			await adapter.removeSandbox();
		} else {
			await adapter.cleanup();
		}
	}
}
