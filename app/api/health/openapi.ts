import {
	OpenAPI,
	OperationBuilder,
	SchemaBuilder,
	ref,
} from "@/services/swagger/swagger.builder";

const healthDataSchema = SchemaBuilder.object()
	.setDescription("Current health of the API.")
	.addEnum("status", ["healthy"], { required: true, example: "healthy" })
	.addNumber("uptime", {
		required: true,
		description: "Seconds since the server process started.",
		example: 1234.56,
	});

// Standard envelope (services/api-response) — see AGENTS.md "API Response Envelope".
const responseMetaSchema = SchemaBuilder.object()
	.addString("timestamp", {
		required: true,
		format: "date-time",
		example: "2026-01-01T00:00:00.000Z",
	})
	.addInteger("responseTimeMs", {
		required: true,
		description:
			"How long the API took to build this response, in milliseconds.",
		example: 2,
	});

const healthResponseSchema = SchemaBuilder.object()
	.setDescription("Standard success envelope wrapping `HealthData`.")
	.addBoolean("success", { required: true, example: true })
	.addInteger("status", { required: true, example: 200 })
	.addRef("data", "HealthData", true)
	.addObject("meta", responseMetaSchema, true);

const healthOperation = OperationBuilder.create("Check API health")
	.setTags("Health")
	.setDescription(
		"Lightweight liveness check for the API itself — no downstream dependencies checked. `meta.responseTimeMs` is how long the API took to respond, in milliseconds.",
	)
	.setPublic()
	.setOperationId("getHealth")
	.addResponse(200, "API is healthy", ref("HealthResponse"), {
		example: {
			success: true,
			status: 200,
			data: { status: "healthy", uptime: 1234.56 },
			meta: { timestamp: "2026-01-01T00:00:00.000Z", responseTimeMs: 2 },
		},
	})
	.setImplementation("real");

export const healthOpenApi = OpenAPI.module()
	.addTag("Health", "API liveness/health check.")
	.addSchema("HealthData", healthDataSchema)
	.addSchema("HealthResponse", healthResponseSchema)
	.addEndpoint("/api/health", "get", healthOperation)
	.export();
