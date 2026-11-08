import {
	OpenAPI,
	OperationBuilder,
	SchemaBuilder,
	ref,
} from "@/services/swagger/swagger.builder";

const runRequestSchema = SchemaBuilder.object()
	.setDescription("Command to run inside a fresh sandbox.")
	.addString("command", {
		required: true,
		description: "The executable to run.",
		example: "echo",
	})
	.addArray("args", { type: "string" })
	.addEnum("language", ["python", "nodejs"], {
		description:
			"Sandbox runtime. Omit to use the adapter's default runtime.",
		example: "python",
	})
	.addEnum("provider", ["vercel", "docker-local"], {
		description:
			"Which Runner Adapter to use (services/sandbox). Omit to use the `RUNNER_PROVIDER` env var, then `\"vercel\"`.",
		example: "vercel",
	});

const runResultSchema = SchemaBuilder.object()
	.setDescription("Result of running the command in the sandbox.")
	.addEnum("provider", ["vercel", "docker-local"], {
		required: true,
		description: "The Runner Adapter that actually executed this command.",
		example: "vercel",
	})
	.addInteger("exitCode", { required: true, example: 0 })
	.addString("stdout", { required: true, example: "hello\n" })
	.addString("stderr", { required: true, example: "" })
	.addInteger("durationMs", { required: true, example: 842 });

// Standard envelope (services/api-response) — every route's openapi.ts wraps
// its own data schema the same way; see AGENTS.md "API Response Envelope".
const responseMetaSchema = SchemaBuilder.object()
	.addString("timestamp", {
		required: true,
		format: "date-time",
		example: "2026-01-01T00:00:00.000Z",
	})
	.addInteger("responseTimeMs", { required: true, example: 842 });

const runResponseSchema = SchemaBuilder.object()
	.setDescription("Standard success envelope wrapping `DemoSandboxRunResult`.")
	.addBoolean("success", { required: true, example: true })
	.addInteger("status", { required: true, example: 200 })
	.addRef("data", "DemoSandboxRunResult", true)
	.addObject("meta", responseMetaSchema, true);

const errorShapeSchema = SchemaBuilder.object()
	.addString("code", { required: true, example: "VALIDATION_ERROR" })
	.addString("message", {
		required: true,
		example: "`command` is required and must be a non-empty string",
	});

const errorResponseSchema = SchemaBuilder.object()
	.setDescription("Standard error envelope (services/api-response).")
	.addBoolean("success", { required: true, example: false })
	.addInteger("status", { required: true, example: 400 })
	.addProp(
		"data",
		{ type: "object", nullable: true, description: "Always `null` for error responses." },
		true,
	)
	.addRef("error", "ApiErrorShape", true)
	.addObject("meta", responseMetaSchema, true);

const runOperation = OperationBuilder.create("Run a command in a sandbox")
	.setTags("Sandbox (Demo)")
	.setDescription(
		"Testing endpoint for the Runner Adapter (services/sandbox). Prepares a fresh sandbox, runs one command, tears it down, and returns the result. Demo/testing only — not part of the real platform API surface.",
	)
	.setPublic()
	.setOperationId("demoSandboxRun")
	.addBody(ref("DemoSandboxRunRequest"), {
		required: true,
		examples: {
			echo: {
				summary: "Echo a message",
				description:
					"Simple smoke test — no `language` set, runs on the adapter's default runtime.",
				value: { command: "echo", args: ["hello-from-sandbox"] },
			},
			pythonInline: {
				summary: "Python — inline script",
				description: "Runs a one-line Python script via `python3 -c`.",
				value: {
					command: "python3",
					args: ["-c", "print('hello from python')"],
					language: "python",
				},
			},
			nodeInline: {
				summary: "Node.js — inline script",
				description: "Runs a one-line Node.js script via `node -e`.",
				value: {
					command: "node",
					args: ["-e", "console.log('hello from node')"],
					language: "nodejs",
				},
			},
			mathPython: {
				summary: "Python — math calculation",
				description:
					"Verified: arithmetic with mixed operators and precedence. Expect `1040.0`.",
				value: {
					command: "python3",
					args: ["-c", "print(2**10 + 3*7 - 15/3)"],
					language: "python",
				},
			},
			mathNode: {
				summary: "Node.js — math calculation",
				description:
					"Verified: `Math` built-ins plus operators. Expect `1015`.",
				value: {
					command: "node",
					args: ["-e", "console.log(Math.sqrt(144) + 2**10 - 7*3)"],
					language: "nodejs",
				},
			},
			multiStepShell: {
				summary: "Shell — multi-step script",
				description:
					"Chains several commands with `bash -c` to exercise filesystem writes, directory creation, and sequencing in one call — works on either provider.",
				value: {
					command: "bash",
					args: [
						"-c",
						"echo step1 && mkdir -p /tmp/demo && echo step2 > /tmp/demo/file.txt && cat /tmp/demo/file.txt && echo done",
					],
				},
			},
			nonZeroExit: {
				summary: "Shell — deliberate non-zero exit code",
				description:
					"Doesn't fail the HTTP request — tests that a failing in-sandbox command is reported through `exitCode`/`stderr` in a 200 response, not thrown as a 500.",
				value: { command: "bash", args: ["-c", "echo about to fail; exit 42"] },
			},
			fetchPython: {
				summary: "Python — fetch GitHub users over the network",
				description:
					"Verified: calls GitHub's public `/users` API (no auth needed) with `urllib` (stdlib, no curl dependency — works on the `python` image) and extracts `login`, `id`, `avatar_url` from each result.",
				value: {
					command: "python3",
					args: [
						"-c",
						"import urllib.request, json; req = urllib.request.Request('https://api.github.com/users?per_page=5', headers={'User-Agent': 'workcrew-ai-demo'}); data = json.load(urllib.request.urlopen(req)); users = [{'login': u['login'], 'id': u['id'], 'avatar_url': u['avatar_url']} for u in data]; print(json.dumps(users, indent=2))",
					],
					language: "python",
				},
			},
			fetchNode: {
				summary: "Node.js — fetch GitHub users over the network",
				description:
					"Verified: same endpoint and fields as `fetchPython`, using Node's native `fetch` instead (no curl dependency — works on the `nodejs` image) — compare the two to confirm both runtimes handle it the same way.",
				value: {
					command: "node",
					args: [
						"-e",
						"fetch('https://api.github.com/users?per_page=5').then(r => r.json()).then(data => { const users = data.map(u => ({ login: u.login, id: u.id, avatar_url: u.avatar_url })); console.log(JSON.stringify(users, null, 2)); })",
					],
					language: "nodejs",
				},
			}
		},
	})
	.addResponse(200, "Command executed", ref("DemoSandboxRunResponse"), {
		example: {
			success: true,
			status: 200,
			data: {
				provider: "vercel",
				exitCode: 0,
				stdout: "hello-from-sandbox\n",
				stderr: "",
				durationMs: 842,
			},
			meta: { timestamp: "2026-01-01T00:00:00.000Z", responseTimeMs: 842 },
		},
	})
	.addResponse(
		400,
		"Missing or invalid `command`/`provider`",
		ref("DemoSandboxErrorResponse"),
	)
	.addResponse(500, "Sandbox execution failed", ref("DemoSandboxErrorResponse"))
	.setImplementation("real");

export const demoSandboxOpenApi = OpenAPI.module()
	.addTag(
		"Sandbox (Demo)",
		"Test endpoint for the Runner Adapter (services/sandbox) — not for production use.",
	)
	.addSchema("DemoSandboxRunRequest", runRequestSchema)
	.addSchema("DemoSandboxRunResult", runResultSchema)
	.addSchema("DemoSandboxRunResponse", runResponseSchema)
	.addSchema("ApiErrorShape", errorShapeSchema)
	.addSchema("DemoSandboxErrorResponse", errorResponseSchema)
	.addEndpoint("/api/demo-sandbox", "post", runOperation)
	.export();
