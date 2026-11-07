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
	});

const runResponseSchema = SchemaBuilder.object()
	.setDescription("Result of running the command in the sandbox.")
	.addInteger("exitCode", { required: true, example: 0 })
	.addString("stdout", { required: true, example: "hello\n" })
	.addString("stderr", { required: true, example: "" })
	.addInteger("durationMs", { required: true, example: 842 });

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
			pythonVersion: {
				summary: "Python — check version",
				description: "Runs `python3 --version` in a Python-runtime sandbox.",
				value: { command: "python3", args: ["--version"], language: "python" },
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
			nodeVersion: {
				summary: "Node.js — check version",
				description: "Runs `node --version` in a Node.js-runtime sandbox.",
				value: { command: "node", args: ["--version"], language: "nodejs" },
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
		},
	})
	.addResponse(200, "Command executed", ref("DemoSandboxRunResponse"), {
		example: {
			exitCode: 0,
			stdout: "hello-from-sandbox\n",
			stderr: "",
			durationMs: 842,
		},
	})
	.addResponse(400, "Missing or invalid `command`")
	.addResponse(500, "Sandbox execution failed")
	.setImplementation("real");

export const demoSandboxOpenApi = OpenAPI.module()
	.addTag(
		"Sandbox (Demo)",
		"Test endpoint for the Runner Adapter (services/sandbox) — not for production use.",
	)
	.addSchema("DemoSandboxRunRequest", runRequestSchema)
	.addSchema("DemoSandboxRunResponse", runResponseSchema)
	.addEndpoint("/api/demo-sandbox", "post", runOperation)
	.export();
