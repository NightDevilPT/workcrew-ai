import { NextResponse } from "next/server";
import {
	DEFAULT_STATUS_CODES,
	DEFAULT_STATUS_MESSAGES,
	HttpStatusCode,
	type ApiErrorInput,
	type ApiErrorResponse,
	type ApiSuccessResponse,
	type PaginationInput,
	type PaginationMeta,
	type ResponseMeta,
} from "./types";

/**
 * Builds the standard API response envelope (AGENTS.md "API Response
 * Envelope"). Every `app/api/**` route handler uses the exported
 * `apiResponseService` singleton — never a hand-shaped `NextResponse.json()`.
 */
class ApiResponseService {
	/** Call at the top of a route handler; pass the result as `startedAt` so `meta.responseTimeMs` is accurate. */
	startTimer(): number {
		return Date.now();
	}

	/** Turns a page/pageSize/totalItems count into the full `PaginationMeta` shape. */
	buildPagination(input: PaginationInput): PaginationMeta {
		const totalPages = Math.max(
			1,
			Math.ceil(input.totalItems / input.pageSize),
		);
		const currentPage = Math.min(Math.max(1, input.currentPage), totalPages);

		return {
			totalPages,
			currentPage,
			nextPage: currentPage < totalPages ? currentPage + 1 : null,
			previousPage: currentPage > 1 ? currentPage - 1 : null,
			hasPrevious: currentPage > 1,
			hasNext: currentPage < totalPages,
			totalItems: input.totalItems,
		};
	}

	/** Builds and returns the standard success envelope. Default status: `200 OK`. */
	success<T>(
		data: T,
		options: {
			status?: HttpStatusCode;
			pagination?: PaginationMeta;
			startedAt?: number;
		} = {},
	): NextResponse<ApiSuccessResponse<T>> {
		const status = options.status ?? HttpStatusCode.OK;

		const body: ApiSuccessResponse<T> = {
			success: true,
			status,
			data,
			...(options.pagination && { pagination: options.pagination }),
			meta: this.buildMeta(options.startedAt),
		};

		return NextResponse.json(body, { status });
	}

	/**
	 * Builds and returns the standard error envelope. Default status:
	 * `500 Internal Server Error`. `code`/`message` default from
	 * `DEFAULT_STATUS_CODES`/`DEFAULT_STATUS_MESSAGES` for `status` when omitted.
	 */
	error(input: ApiErrorInput = {}): NextResponse<ApiErrorResponse> {
		const status = input.status ?? HttpStatusCode.INTERNAL_SERVER_ERROR;
		const code = input.code ?? DEFAULT_STATUS_CODES[status];
		const message = input.message ?? DEFAULT_STATUS_MESSAGES[status];

		const body: ApiErrorResponse = {
			success: false,
			status,
			data: null,
			error: {
				code,
				message,
				...(input.details !== undefined && { details: input.details }),
			},
			meta: this.buildMeta(input.startedAt),
		};

		return NextResponse.json(body, { status });
	}

	private buildMeta(startedAt: number | undefined): ResponseMeta {
		return {
			timestamp: new Date().toISOString(),
			responseTimeMs: Date.now() - (startedAt ?? Date.now()),
		};
	}
}

export const apiResponseService = new ApiResponseService();
