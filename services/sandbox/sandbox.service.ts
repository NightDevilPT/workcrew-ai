import type { RunnerAdapter } from "./sandbox.types";
import { VercelSandboxRunnerAdapter } from "./adapters/vercel-sandbox.adapter";
import { DockerLocalRunnerAdapter } from "./adapters/docker-local.adapter";

export type RunnerProvider = "vercel" | "docker-local";

/**
 * Selects the Runner Adapter implementation (docs/tech-stack.md §3.2 /
 * §9 Adapter Selection at Startup). Callers never import a concrete adapter
 * class directly — only this factory and the `RunnerAdapter` interface.
 *
 * Swap the implementation either by passing `provider` explicitly, or by
 * setting `RUNNER_PROVIDER` in the environment. Add a new case here (and a
 * new file in `./adapters`) when another provider is built — nothing that
 * calls `getRunnerAdapter()` needs to change.
 */
export function getRunnerAdapter(
	provider: RunnerProvider = (process.env.RUNNER_PROVIDER as
		| RunnerProvider
		| undefined) ?? "vercel",
): RunnerAdapter {
	switch (provider) {
		case "vercel":
			return new VercelSandboxRunnerAdapter();
		case "docker-local":
			return new DockerLocalRunnerAdapter();
		default:
			throw new Error(`Unsupported runner provider: ${provider}`);
	}
}
