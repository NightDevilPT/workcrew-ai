/**
 * Fluent OpenAPI builder.
 *
 * Feature folders build an isolated module with `OpenAPI.module()` and export
 * `{ paths, schemas, tags }`; `services/swagger/routes/index.ts` merges the modules.
 * The builder is format-agnostic: each API defines its own response and error shapes.
 */

import { OpenAPIV3 } from "openapi-types";

type Schema = OpenAPIV3.SchemaObject;
type Ref = OpenAPIV3.ReferenceObject;
type SchemaInput = SchemaBuilder | Schema | Ref;
type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

interface PropOptions {
	required?: boolean;
	description?: string;
	nullable?: boolean;
}

/**
 * Builds an OpenAPI schema ref.
 *
 * @param {string} name - Schema name registered under components.schemas.
 * @returns {Ref} Reference object.
 */
export const ref = (name: string): Ref => ({
	$ref: `#/components/schemas/${name}`,
});

/**
 * Resolves a builder or raw schema to a plain schema/ref object.
 *
 * @param {SchemaInput} input - Builder, schema, or reference.
 * @returns {Schema | Ref} Plain OpenAPI object.
 */
const resolve = (input: SchemaInput): Schema | Ref =>
	input instanceof SchemaBuilder ? input.build() : input;

/** Fluent builder for object schemas. */
export class SchemaBuilder {
	private properties: Record<string, Schema | Ref> = {};
	private requiredProps: string[] = [];
	private meta: Pick<Schema, "description" | "example"> = {};

	/**
	 * Starts an object schema.
	 *
	 * @returns {SchemaBuilder} New builder.
	 */
	static object(): SchemaBuilder {
		return new SchemaBuilder();
	}

	/**
	 * Adds a property of any schema or $ref.
	 *
	 * @param {string} name - Property name.
	 * @param {Schema | Ref} definition - Property schema.
	 * @param {boolean} [required=false] - Mark as required.
	 * @returns {this} Builder for chaining.
	 */
	addProp(name: string, definition: Schema | Ref, required = false): this {
		this.properties[name] = definition;
		if (required && !this.requiredProps.includes(name)) {
			this.requiredProps.push(name);
		}
		return this;
	}

	/** Adds a string property. */
	addString(
		name: string,
		options: PropOptions & { format?: string; example?: string } = {},
	): this {
		const { required, ...schema } = options;
		return this.addProp(name, { type: "string", ...schema }, required);
	}

	/** Adds a number (float/decimal) property. */
	addNumber(
		name: string,
		options: PropOptions & { format?: string; example?: number } = {},
	): this {
		const { required, ...schema } = options;
		return this.addProp(name, { type: "number", ...schema }, required);
	}

	/** Adds an integer property. */
	addInteger(
		name: string,
		options: PropOptions & { example?: number } = {},
	): this {
		const { required, ...schema } = options;
		return this.addProp(name, { type: "integer", ...schema }, required);
	}

	/** Adds a boolean property. */
	addBoolean(
		name: string,
		options: PropOptions & { example?: boolean } = {},
	): this {
		const { required, ...schema } = options;
		return this.addProp(name, { type: "boolean", ...schema }, required);
	}

	/** Adds a string enum property. */
	addEnum(
		name: string,
		values: string[],
		options: PropOptions & { example?: string } = {},
	): this {
		const { required, ...schema } = options;
		return this.addProp(
			name,
			{ type: "string", enum: values, ...schema },
			required,
		);
	}

	/** Adds an array property whose items are a schema, builder, or $ref. */
	addArray(name: string, items: SchemaInput, required = false): this {
		return this.addProp(
			name,
			{ type: "array", items: resolve(items) },
			required,
		);
	}

	/** Adds a nested object property from a builder or raw schema. */
	addObject(name: string, schema: SchemaInput, required = false): this {
		return this.addProp(name, resolve(schema), required);
	}

	/** Sets the schema description. */
	setDescription(description: string): this {
		this.meta.description = description;
		return this;
	}

	/** Sets a schema-level example (shown as the sample in Swagger UI). */
	setExample(example: unknown): this {
		this.meta.example = example;
		return this;
	}

	/** Adds a property that references a named component schema. */
	addRef(name: string, schemaName: string, required = false): this {
		return this.addProp(name, ref(schemaName), required);
	}

	/**
	 * Produces the final schema object.
	 *
	 * @returns {Schema} OpenAPI schema; `required` is omitted when empty.
	 */
	build(): Schema {
		const schema: Schema = {
			type: "object",
			...this.meta,
			properties: { ...this.properties },
		};
		if (this.requiredProps.length)
			schema.required = [...this.requiredProps];
		return schema;
	}
}

/** Fluent builder for a single HTTP operation. */
export class OperationBuilder {
	private operation: OpenAPIV3.OperationObject = { responses: {} };
	private implementation?: "mock" | "real";

	private constructor(summary?: string) {
		this.operation.summary = summary;
	}

	/**
	 * Starts an operation.
	 *
	 * @param {string} [summary] - One-line summary shown in Swagger UI.
	 * @returns {OperationBuilder} New builder.
	 */
	static create(summary?: string): OperationBuilder {
		return new OperationBuilder(summary);
	}

	/** Sets the Swagger UI group tags. */
	setTags(...tags: string[]): this {
		this.operation.tags = tags;
		return this;
	}

	/** Sets the long description (markdown). */
	setDescription(description: string): this {
		this.operation.description = description;
		return this;
	}

	/** Sets a unique operationId (useful for client generators). */
	setOperationId(id: string): this {
		this.operation.operationId = id;
		return this;
	}

	/**
	 * Marks whether the endpoint's `route.ts` is a mock or a real implementation.
	 * Adds the `x-implementation` extension, a description banner and, for mock, a `[MOCK]` summary prefix.
	 * Switch `'mock'` to `'real'` when the real route is finished.
	 */
	setImplementation(status: "mock" | "real"): this {
		this.implementation = status;
		return this;
	}

	/** Marks the endpoint as public (no auth). */
	setPublic(): this {
		this.operation.security = [];
		return this;
	}

	/** Requires one of the given security schemes (e.g. 'CookieAuth' or 'ClientSecretAuth'). */
	setSecurity(...schemes: string[]): this {
		this.operation.security = schemes.map((s) => ({ [s]: [] }));
		return this;
	}

	private addParameter(
		location: "path" | "query" | "header",
		name: string,
		schema: Schema,
		required: boolean,
		description?: string,
	): this {
		this.operation.parameters = [
			...((this.operation.parameters as OpenAPIV3.ParameterObject[]) ??
				[]),
			{ name, in: location, required, description, schema },
		];
		return this;
	}

	/** Adds a path parameter (always required). */
	addParam(
		name: string,
		schema: Schema = { type: "string" },
		description?: string,
	): this {
		return this.addParameter("path", name, schema, true, description);
	}

	/** Adds a query parameter. */
	addQuery(
		name: string,
		schema: Schema = { type: "string" },
		required = false,
		description?: string,
	): this {
		return this.addParameter("query", name, schema, required, description);
	}

	/** Adds a request header. */
	addHeader(
		name: string,
		schema: Schema = { type: "string" },
		required = false,
		description?: string,
	): this {
		return this.addParameter("header", name, schema, required, description);
	}

	/**
	 * Attaches a request body. Call again with another `contentType` to offer
	 * several formats (e.g. JSON and multipart) for the same operation.
	 */
	addBody(
		schema: SchemaInput,
		options: {
			description?: string;
			required?: boolean;
			contentType?: string;
			example?: unknown;
			examples?: Record<string, OpenAPIV3.ExampleObject>;
		} = {},
	): this {
		const existing = this.operation.requestBody as
			| OpenAPIV3.RequestBodyObject
			| undefined;
		this.operation.requestBody = {
			description: options.description ?? existing?.description,
			required: options.required ?? existing?.required ?? true,
			content: {
				...existing?.content,
				[options.contentType ?? "application/json"]: {
					schema: resolve(schema),
					...(options.example !== undefined && {
						example: options.example,
					}),
					...(options.examples && { examples: options.examples }),
				},
			},
		};
		return this;
	}

	/** Attaches a response with an optional schema and mock example(s). */
	addResponse(
		status: number,
		description: string,
		schema?: SchemaInput,
		options: {
			example?: unknown;
			examples?: Record<string, OpenAPIV3.ExampleObject>;
		} = {},
	): this {
		this.operation.responses[String(status)] = {
			description,
			...(schema && {
				content: {
					"application/json": {
						schema: resolve(schema),
						...(options.example !== undefined && {
							example: options.example,
						}),
						...(options.examples && { examples: options.examples }),
					},
				},
			}),
		};
		return this;
	}

	/** Applies a reusable mixin, e.g. a feature's standard error responses. */
	use(mixin: (operation: this) => unknown): this {
		mixin(this);
		return this;
	}

	/**
	 * Produces the final operation object.
	 *
	 * @returns {OpenAPIV3.OperationObject} OpenAPI operation.
	 */
	build(): OpenAPIV3.OperationObject {
		if (!this.implementation) return this.operation;
		const banner =
			this.implementation === "mock"
				? "**Implementation: MOCK.** The `route.ts` for this endpoint returns static mock data. Check this before starting development, and switch to `real` in this `openapi.ts` when the real route is done."
				: "**Implementation: REAL.**";
		return {
			...this.operation,
			summary:
				this.implementation === "mock" && this.operation.summary
					? `[MOCK] ${this.operation.summary}`
					: this.operation.summary,
			description: this.operation.description
				? `${banner}\n\n${this.operation.description}`
				: banner,
			"x-implementation": this.implementation,
		} as OpenAPIV3.OperationObject;
	}
}

/** Fragment exported by each feature folder. */
export interface ApiModuleExport {
	paths: OpenAPIV3.PathsObject;
	schemas: Record<string, Schema>;
	tags: OpenAPIV3.TagObject[];
}

/** Collects the tags, schemas, and endpoints of one feature. */
export class ModuleBuilder {
	private paths: OpenAPIV3.PathsObject = {};
	private schemas: Record<string, Schema> = {};
	private tags: OpenAPIV3.TagObject[] = [];

	/** Applies a registration function, letting a feature split its spec across files. */
	use(register: (module: this) => unknown): this {
		register(this);
		return this;
	}

	/** Merges another module fragment (paths are combined per path, tags deduplicated). */
	merge(fragment: ApiModuleExport): this {
		Object.entries(fragment.paths).forEach(([path, item]) => {
			this.paths[path] = { ...this.paths[path], ...item };
		});
		Object.assign(this.schemas, fragment.schemas);
		fragment.tags.forEach((tag) => {
			if (!this.tags.some((existing) => existing.name === tag.name))
				this.tags.push(tag);
		});
		return this;
	}

	/** Registers a swagger tag. */
	addTag(name: string, description?: string): this {
		this.tags.push({ name, description });
		return this;
	}

	/** Registers a named component schema. */
	addSchema(name: string, schema: SchemaBuilder | Schema): this {
		this.schemas[name] =
			schema instanceof SchemaBuilder ? schema.build() : schema;
		return this;
	}

	/** Registers an endpoint for a path and HTTP method. */
	addEndpoint(
		path: string,
		method: HttpMethod,
		operation: OperationBuilder | OpenAPIV3.OperationObject,
	): this {
		this.paths[path] = {
			...this.paths[path],
			[method]:
				operation instanceof OperationBuilder
					? operation.build()
					: operation,
		};
		return this;
	}

	/**
	 * Produces the module fragment.
	 *
	 * @returns {ApiModuleExport} Paths, schemas, and tags for aggregation.
	 */
	export(): ApiModuleExport {
		return { paths: this.paths, schemas: this.schemas, tags: this.tags };
	}
}

/**
 * Entry point: `OpenAPI.module()` inside a feature folder.
 */
export const OpenAPI = {
	module: (): ModuleBuilder => new ModuleBuilder(),
};
