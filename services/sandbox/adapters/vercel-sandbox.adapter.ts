import { Sandbox } from "@vercel/sandbox";
import type {
	RunContext,
	RunnerAdapter,
	RunnerSnapshot,
	RunStep,
	RunStepResult,
	SandboxLanguage,
} from "../sandbox.types";

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

/**
 * Maps our closed `SandboxLanguage` set onto this adapter's actual Vercel
 * image strings. Add a new line here when `SandboxLanguage` gains a value —
 * this is the only place that needs to know Vercel's image naming.
 */
const LANGUAGE_IMAGE_MAP: Record<SandboxLanguage, string> = {
	python: "python:3.14",
	nodejs: "node:24",
};

/**
 * Explicit Vercel credentials, when all three env vars are set. `Sandbox.create()`
 * otherwise falls back to resolving an OIDC token (via `vercel link` + `vercel env
 * pull`) or, in an interactive TTY, a device-auth login prompt — neither of which
 * works from inside a long-running server process like `next dev`'s own process
 * or a deployed Agent Worker. Set `VERCEL_TOKEN` / `VERCEL_TEAM_ID` /
 * `VERCEL_PROJECT_ID` to bypass that entirely.
 */
function getVercelCredentials():
	| { token: string; teamId: string; projectId: string }
	| undefined {
	const token = process.env.VERCEL_TOKEN;
	const teamId = process.env.VERCEL_TEAM_ID;
	const projectId = process.env.VERCEL_PROJECT_ID;

	return token && teamId && projectId ? { token, teamId, projectId } : undefined;
}

/**
 * Runner Adapter backed by Vercel Sandbox (docs/vercel-sandbox.md).
 * One instance = one prepared sandbox for one stage run.
 *
 * Works with or without a repo, and with any supported `SandboxLanguage`:
 * pass `repoUrl`/`gitToken` only for code-editing stages; omit both for a
 * plain task sandbox (generate a file, run a script, etc.), and set
 * `language` to pick the runtime (defaults to Vercel's `universal` image,
 * which already has Node.js, Python and Bun installed, when omitted).
 */
export class VercelSandboxRunnerAdapter implements RunnerAdapter {
	private sandbox: Sandbox | null = null;

	async prepare(context: RunContext): Promise<void> {
		const source = context.repoUrl
			? {
					type: "git" as const,
					url: context.repoUrl,
					depth: 1,
					...(context.gitToken && {
						username: context.gitUsername ?? "x-access-token",
						password: context.gitToken,
					}),
				}
			: undefined;

		const image = context.language
			? LANGUAGE_IMAGE_MAP[context.language]
			: undefined;

		this.sandbox = await Sandbox.create({
			timeout: context.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			...(source && { source }),
			...(image && { image }),
			...getVercelCredentials(),
		});
	}

	async execute(step: RunStep): Promise<RunStepResult> {
		if (!this.sandbox) {
			throw new Error(
				"VercelSandboxRunnerAdapter: call prepare() before execute()",
			);
		}

		const startedAt = Date.now();
		const result = await this.sandbox.runCommand(
			step.command,
			step.args ?? [],
		);

		return {
			exitCode: result.exitCode,
			stdout: await result.stdout(),
			stderr: await result.stderr(),
			durationMs: Date.now() - startedAt,
		};
	}

	async snapshot(): Promise<RunnerSnapshot> {
		if (!this.sandbox) {
			throw new Error(
				"VercelSandboxRunnerAdapter: call prepare() before snapshot()",
			);
		}

		const snapshot = await this.sandbox.snapshot();
		return { snapshotId: snapshot.snapshotId };
	}

	async cleanup(): Promise<void> {
		if (!this.sandbox) return;
		await this.sandbox.stop();
		this.sandbox = null;
	}
}
