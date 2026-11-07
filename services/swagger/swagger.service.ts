/**
 * Swagger Service
 *
 * Builds the complete OpenAPI specification from the feature modules merged in
 * `./routes` (paths, schemas and tags).
 *
 * Security schemes (the only two the APIs support):
 * - `CookieAuth`: access token in the `access_token` cookie, used by the protected APIs.
 * - `ClientSecretAuth`: `x-client-secret` header, used by machine-to-machine APIs.
 *
 * @example
 * ```typescript
 * import { getOpenApiSpec } from '@/services/swagger/swagger.service'
 *
 * export async function GET() {
 *   return NextResponse.json(getOpenApiSpec())
 * }
 * ```
 */

import { OpenAPIV3 } from "openapi-types";
import { allPaths, allSchemas, allTags } from "./routes";

const baseOpenApiConfig = {
	openapi: "3.0.0" as const,
	info: {
		title: "Workcrew AI API",
		version: "1.0.0",
		description:
			"Complete API documentation for the Workcrew AI platform — AI agents doing work tracked as kanban tickets. This documentation provides interactive access to all available endpoints.",
		contact: {
			name: "Workcrew AI Support",
			email: "support@workcrew.ai", // TODO: replace with the real support contact
			url: "https://workcrew.ai/support", // TODO: replace with the real support URL
		},
		license: {
			name: "Proprietary",
		},
	},
	servers: [
		{
			url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
			description: "API Server",
		},
	],
	tags: allTags,
	components: {
		schemas: allSchemas,
		securitySchemes: {
			CookieAuth: {
				type: "apiKey" as const,
				in: "cookie" as const,
				name: "access_token",
				description:
					"Access token set in the `access_token` cookie after a successful login. Paste only the token value here, not the whole cookie string. When you are logged in on this origin the browser already sends the cookie, so Try it out works without authorizing.",
			},
		},
	},
};

/**
 * Get the complete OpenAPI specification.
 *
 * @returns {OpenAPIV3.Document} Complete OpenAPI 3.0 document.
 */
export function getOpenApiSpec(): OpenAPIV3.Document {
	return {
		...baseOpenApiConfig,
		paths: allPaths,
	};
}

/**
 * Get statistics about the OpenAPI specification (counts of paths, endpoints, schemas and tags).
 *
 * @returns {{ totalPaths: number, totalEndpoints: number, totalSchemas: number, totalTags: number, version: string, title: string }} Spec statistics.
 */
export function getOpenApiStats() {
	const spec = getOpenApiSpec();

	const totalEndpoints = Object.values(spec.paths).reduce(
		(count, pathItem) =>
			count +
			Object.keys(pathItem ?? {}).filter((key) =>
				[
					"get",
					"post",
					"put",
					"patch",
					"delete",
					"options",
					"head",
				].includes(key),
			).length,
		0,
	);

	return {
		totalPaths: Object.keys(spec.paths).length,
		totalEndpoints,
		totalSchemas: Object.keys(spec.components?.schemas ?? {}).length,
		totalTags: spec.tags?.length ?? 0,
		version: spec.info.version,
		title: spec.info.title,
	};
}
