import { OpenAPI } from "../swagger.builder";
import { demoSandboxOpenApi } from "@/app/api/demo-sandbox/openapi";
import { healthOpenApi } from "@/app/api/health/openapi";

const aggregate = OpenAPI.module()
	.merge(demoSandboxOpenApi)
	.merge(healthOpenApi)
	.export();

/**
 * All API paths combined
 */
export const allPaths = aggregate.paths;

/**
 * All API schemas combined
 */
export const allSchemas = aggregate.schemas;

/**
 * All API tags combined
 */
export const allTags = aggregate.tags;
