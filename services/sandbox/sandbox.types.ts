/**
 * Runner Adapter contract (docs/tech-stack.md §3.2).
 *
 * Business logic calls this interface only, never a concrete adapter class
 * directly — the concrete implementation is chosen by `getRunnerAdapter()`
 * in `sandbox.service.ts`. Currently only the Vercel Sandbox implementation
 * exists; a local Docker (or any other) implementation is added by dropping
 * a new file in `adapters/` and a new case in that factory, with this
 * interface unchanged.
 */

/**
 * Supported sandbox languages/runtimes. This is deliberately a closed set,
 * not a raw image string — add a new value here (and its mapping in each
 * adapter, e.g. `vercel-sandbox.adapter.ts`'s `LANGUAGE_IMAGE_MAP`) when a
 * new language is supported. Nothing that calls `prepare()` needs to change.
 *
 * Currently supported: `python`, `nodejs`.
 */
export type SandboxLanguage = "python" | "nodejs";

/**
 * Everything needed to prepare a sandbox for one stage run.
 *
 * A repo is optional, not required — a stage can be pure compute with no
 * source control involved at all (generate a spreadsheet, run a one-off
 * Python script, process a file, etc.). Omit `repoUrl` entirely for those;
 * only Sandbox-runtime, code-editing workflows (overview.md §7.1) need it.
 */
export interface RunContext {
	/** Repo to clone into the sandbox. Omit for a sandbox with no repo. */
	repoUrl?: string;
	/** Git username for the clone credential — defaults to `x-access-token`. */
	gitUsername?: string;
	/** Git token (oauth-user or installation token) for a private repo. */
	gitToken?: string;
	/**
	 * Language/runtime for the sandbox. Defaults to the adapter's own default
	 * runtime when omitted — set this only to pin a specific language.
	 */
	language?: SandboxLanguage;
	/** Max sandbox lifetime in ms. */
	timeoutMs?: number;
}

/** One command to run inside the prepared sandbox. */
export interface RunStep {
	command: string;
	args?: string[];
}

/** Result of executing one `RunStep`. */
export interface RunStepResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
}

/** A saved, resumable state of the sandbox's filesystem. */
export interface RunnerSnapshot {
	snapshotId: string;
}

export interface RunnerAdapter {
	/** Creates/configures the sandbox for a stage run (clones the repo if given). */
	prepare(context: RunContext): Promise<void>;
	/** Runs one command inside the prepared sandbox. */
	execute(step: RunStep): Promise<RunStepResult>;
	/** Saves the current filesystem state so a future sandbox can resume from it. */
	snapshot(): Promise<RunnerSnapshot>;
	/** Stops the sandbox and releases the adapter instance. */
	cleanup(): Promise<void>;
}
