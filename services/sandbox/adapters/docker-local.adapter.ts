import Docker from "dockerode";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { promisify } from "node:util";
import type {
	RunContext,
	RunnerAdapter,
	RunnerSnapshot,
	RunStep,
	RunStepResult,
	SandboxLanguage,
} from "../sandbox.types";

const execFileAsync = promisify(execFile);

const DEFAULT_IMAGE = "node:24-slim";

/**
 * Maps our closed `SandboxLanguage` set onto Docker Hub image names for this
 * adapter. Add a new line here when `SandboxLanguage` gains a value — this
 * is the only place that needs to know this adapter's image naming (see the
 * same pattern in `vercel-sandbox.adapter.ts`'s `LANGUAGE_IMAGE_MAP`).
 */
const LANGUAGE_IMAGE_MAP: Record<SandboxLanguage, string> = {
	python: "python:3.14-slim",
	nodejs: "node:24-slim",
};

/**
 * Runner Adapter backed by the developer's own local Docker Engine via
 * `dockerode` (docs/tech-stack.md §3.2, `local` branch).
 *
 * **Dev-only — not a security boundary for untrusted code** (overview.md
 * §12 Main Risks). A repo, when given, is `git clone`'d to a host temp
 * directory and bind-mounted into the container at `/workspace`.
 */
export class DockerLocalRunnerAdapter implements RunnerAdapter {
	private docker = new Docker();
	private container: Docker.Container | null = null;
	private workspaceDir: string | null = null;
	private pulledImage: string | null = null;
	private snapshotImageRefs: string[] = [];

	async prepare(context: RunContext): Promise<void> {
		const image = context.language
			? LANGUAGE_IMAGE_MAP[context.language]
			: DEFAULT_IMAGE;

		await this.pullImageIfMissing(image);
		this.pulledImage = image;

		const binds: string[] = [];
		if (context.repoUrl) {
			this.workspaceDir = await mkdtemp(
				join(tmpdir(), "workcrew-sandbox-"),
			);
			await this.cloneRepo(context, this.workspaceDir);
			binds.push(`${this.workspaceDir}:/workspace`);
		}

		this.container = await this.docker.createContainer({
			Image: image,
			Cmd: ["sleep", "infinity"],
			WorkingDir: this.workspaceDir ? "/workspace" : "/",
			HostConfig: { Binds: binds },
			Tty: false,
		});

		await this.container.start();
	}

	async execute(step: RunStep): Promise<RunStepResult> {
		if (!this.container) {
			throw new Error(
				"DockerLocalRunnerAdapter: call prepare() before execute()",
			);
		}

		const startedAt = Date.now();
		const exec = await this.container.exec({
			Cmd: [step.command, ...(step.args ?? [])],
			AttachStdout: true,
			AttachStderr: true,
		});

		const stream = await exec.start({});
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		const stdoutStream = new Writable({
			write: (chunk, _encoding, callback) => {
				stdoutChunks.push(chunk);
				callback();
			},
		});
		const stderrStream = new Writable({
			write: (chunk, _encoding, callback) => {
				stderrChunks.push(chunk);
				callback();
			},
		});

		await new Promise<void>((resolve, reject) => {
			this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);
			stream.on("end", resolve);
			stream.on("error", reject);
		});

		const { ExitCode } = await exec.inspect();

		return {
			exitCode: ExitCode ?? 0,
			stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
			stderr: Buffer.concat(stderrChunks).toString("utf-8"),
			durationMs: Date.now() - startedAt,
		};
	}

	async snapshot(): Promise<RunnerSnapshot> {
		if (!this.container) {
			throw new Error(
				"DockerLocalRunnerAdapter: call prepare() before snapshot()",
			);
		}

		const repo = "workcrew-sandbox-snapshot";
		const tag = randomUUID();
		await this.container.commit({ repo, tag });

		const snapshotId = `${repo}:${tag}`;
		this.snapshotImageRefs.push(snapshotId);
		return { snapshotId };
	}

	/**
	 * `RunnerAdapter.cleanup()` — ends this run: stops/removes the container
	 * and deletes the cloned-repo temp dir. Mirrors Vercel Sandbox's
	 * `sandbox.stop()` (docs/vercel-sandbox.md §4): the run is over, but
	 * anything durable (here, snapshot images) is left in place.
	 */
	async cleanup(): Promise<void> {
		if (this.container) {
			await this.container.stop().catch(() => {});
			await this.container.remove().catch(() => {});
			this.container = null;
		}
		if (this.workspaceDir) {
			await rm(this.workspaceDir, { recursive: true, force: true }).catch(
				() => {},
			);
			this.workspaceDir = null;
		}
	}

	/**
	 * Docker-local only — not part of `RunnerAdapter`, since Vercel Sandbox
	 * has no equivalent for us to implement (its `sandbox.delete()` is handled
	 * entirely on Vercel's side, with nothing local left behind). Local Docker
	 * resources are ours to own, so without this they'd accumulate forever:
	 *
	 * - Runs `cleanup()` first (stop/remove the container, delete the temp dir).
	 * - Removes every snapshot image this instance created via `snapshot()` —
	 *   each one has a unique, never-reused tag, so leaving them around is pure leak.
	 * - Leaves the pulled base image (e.g. `python:3.14-slim`) alone by default,
	 *   so the next run doesn't re-pull it — pass `removeImage: true` to also
	 *   remove that image when you explicitly want a fully clean slate.
	 */
	async removeSandbox(options: { removeImage?: boolean } = {}): Promise<void> {
		await this.cleanup();

		for (const ref of this.snapshotImageRefs) {
			await this.docker
				.getImage(ref)
				.remove({ force: true })
				.catch(() => {});
		}
		this.snapshotImageRefs = [];

		if (options.removeImage && this.pulledImage) {
			await this.docker
				.getImage(this.pulledImage)
				.remove({ force: true })
				.catch(() => {});
			this.pulledImage = null;
		}
	}

	private async cloneRepo(
		context: RunContext,
		targetDir: string,
	): Promise<void> {
		if (!context.repoUrl) return;

		const url = context.gitToken
			? context.repoUrl.replace(
					"https://",
					`https://${context.gitUsername ?? "x-access-token"}:${context.gitToken}@`,
				)
			: context.repoUrl;

		await execFileAsync("git", ["clone", "--depth", "1", url, targetDir]);
	}

	private async pullImageIfMissing(image: string): Promise<void> {
		const existing = await this.docker.listImages({
			filters: { reference: [image] },
		});
		if (existing.length > 0) return;

		const stream = await this.docker.pull(image);
		await new Promise<void>((resolve, reject) => {
			this.docker.modem.followProgress(stream, (err) =>
				err ? reject(err) : resolve(),
			);
		});
	}
}
