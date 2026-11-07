import { NextRequest, NextResponse } from "next/server";
import { getRunnerAdapter } from "@/services/sandbox/sandbox.service";
import type { SandboxLanguage } from "@/services/sandbox/sandbox.types";

interface DemoSandboxRunBody {
	command?: string;
	args?: string[];
	language?: SandboxLanguage;
}

/**
 * POST /api/demo-sandbox - Testing endpoint for the Runner Adapter (services/sandbox).
 * Runs one command in a fresh sandbox and returns its output. Demo/testing only.
 */
export async function POST(request: NextRequest) {
	const body = (await request.json()) as DemoSandboxRunBody;

	if (typeof body.command !== "string" || body.command.trim().length === 0) {
		return NextResponse.json(
			{ error: "`command` is required and must be a non-empty string" },
			{ status: 400 },
		);
	}

	const adapter = getRunnerAdapter();

	try {
		await adapter.prepare({ language: body.language });
		const result = await adapter.execute({
			command: body.command,
			args: body.args,
		});
		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Sandbox execution failed",
			},
			{ status: 500 },
		);
	} finally {
		await adapter.cleanup();
	}
}
