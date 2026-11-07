import { OpenAPI } from "../swagger.builder";
import { demoSandboxOpenApi } from "@/app/api/demo-sandbox/openapi";

const aggregate = OpenAPI.module().merge(demoSandboxOpenApi).export();

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
