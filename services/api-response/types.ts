/**
 * Standard API response envelope (services/api-response). Every `app/api/**`
 * route returns one of these two shapes via `apiResponseService` from
 * `./service` — never a hand-shaped `NextResponse.json({...})`.
 */

/** HTTP status codes this service knows a default code/message for. */
export enum HttpStatusCode {
	OK = 200,
	CREATED = 201,
	NO_CONTENT = 204,
	BAD_REQUEST = 400,
	UNAUTHORIZED = 401,
	FORBIDDEN = 403,
	NOT_FOUND = 404,
	CONFLICT = 409,
	UNPROCESSABLE_ENTITY = 422,
	TOO_MANY_REQUESTS = 429,
	INTERNAL_SERVER_ERROR = 500,
	BAD_GATEWAY = 502,
	SERVICE_UNAVAILABLE = 503,
}

/** Machine-readable `error.code` used when a route doesn't pass one explicitly. */
export const DEFAULT_STATUS_CODES: Record<HttpStatusCode, string> = {
	[HttpStatusCode.OK]: "OK",
	[HttpStatusCode.CREATED]: "CREATED",
	[HttpStatusCode.NO_CONTENT]: "NO_CONTENT",
	[HttpStatusCode.BAD_REQUEST]: "BAD_REQUEST",
	[HttpStatusCode.UNAUTHORIZED]: "UNAUTHORIZED",
	[HttpStatusCode.FORBIDDEN]: "FORBIDDEN",
	[HttpStatusCode.NOT_FOUND]: "NOT_FOUND",
	[HttpStatusCode.CONFLICT]: "CONFLICT",
	[HttpStatusCode.UNPROCESSABLE_ENTITY]: "UNPROCESSABLE_ENTITY",
	[HttpStatusCode.TOO_MANY_REQUESTS]: "TOO_MANY_REQUESTS",
	[HttpStatusCode.INTERNAL_SERVER_ERROR]: "INTERNAL_SERVER_ERROR",
	[HttpStatusCode.BAD_GATEWAY]: "BAD_GATEWAY",
	[HttpStatusCode.SERVICE_UNAVAILABLE]: "SERVICE_UNAVAILABLE",
};

/** Human-readable `error.message` used when a route doesn't pass one explicitly. */
export const DEFAULT_STATUS_MESSAGES: Record<HttpStatusCode, string> = {
	[HttpStatusCode.OK]: "OK",
	[HttpStatusCode.CREATED]: "Created",
	[HttpStatusCode.NO_CONTENT]: "No Content",
	[HttpStatusCode.BAD_REQUEST]: "Bad Request",
	[HttpStatusCode.UNAUTHORIZED]: "Unauthorized",
	[HttpStatusCode.FORBIDDEN]: "Forbidden",
	[HttpStatusCode.NOT_FOUND]: "Not Found",
	[HttpStatusCode.CONFLICT]: "Conflict",
	[HttpStatusCode.UNPROCESSABLE_ENTITY]: "Unprocessable Entity",
	[HttpStatusCode.TOO_MANY_REQUESTS]: "Too Many Requests",
	[HttpStatusCode.INTERNAL_SERVER_ERROR]: "Internal Server Error",
	[HttpStatusCode.BAD_GATEWAY]: "Bad Gateway",
	[HttpStatusCode.SERVICE_UNAVAILABLE]: "Service Unavailable",
};

export interface PaginationMeta {
	/** Total number of pages for the current page size. */
	totalPages: number;
	/** 1-indexed current page. */
	currentPage: number;
	/** Next page number, or `null` on the last page. */
	nextPage: number | null;
	/** Previous page number, or `null` on the first page. */
	previousPage: number | null;
	/** `true` unless `currentPage` is the first page. */
	hasPrevious: boolean;
	/** `true` unless `currentPage` is the last page. */
	hasNext: boolean;
	/** Total number of items across all pages, when known. */
	totalItems?: number;
}

/** Input to `buildPagination()` — what a route already knows after a query. */
export interface PaginationInput {
	currentPage: number;
	pageSize: number;
	totalItems: number;
}

export interface ResponseMeta {
	/** ISO 8601 timestamp of when the response was built. */
	timestamp: string;
	/** Wall-clock time spent handling the request, in milliseconds. */
	responseTimeMs: number;
}

export interface ApiErrorShape {
	/** Short, stable, machine-readable code (e.g. `"VALIDATION_ERROR"`, `"NOT_FOUND"`). */
	code: string;
	/** Human-readable message, safe to show to API consumers. */
	message: string;
	/** Optional extra detail — e.g. a Zod error tree. Never include secrets or stack traces. */
	details?: unknown;
}

/**
 * Input to `ApiResponseService.error()`. `code`/`message` are optional here —
 * omit either to fall back to `DEFAULT_STATUS_CODES`/`DEFAULT_STATUS_MESSAGES`
 * for the given `status`.
 */
export interface ApiErrorInput {
	status?: HttpStatusCode;
	code?: string;
	message?: string;
	details?: unknown;
	startedAt?: number;
}

export interface ApiSuccessResponse<T> {
	success: true;
	status: number;
	data: T;
	pagination?: PaginationMeta;
	meta: ResponseMeta;
}

export interface ApiErrorResponse {
	success: false;
	status: number;
	data: null;
	error: ApiErrorShape;
	meta: ResponseMeta;
}

/** The full envelope — discriminated on `success` so `data`/`error` narrow correctly. */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;
