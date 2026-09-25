import type { ErrorCode } from '../errors/error-codes.js';

/** Metadata attached to cursor-paginated responses. */
export interface PaginationMeta {
  nextCursor: string | null;
}

export interface ApiSuccess<TData, TMeta = never> {
  success: true;
  message: string;
  data: TData;
  meta?: TMeta;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  error: {
    code: ErrorCode;
    details: ValidationIssue[] | null;
  };
}

/** Standard response envelope returned by every API endpoint. */
export type ApiResponse<TData, TMeta = never> = ApiSuccess<TData, TMeta> | ApiErrorBody;
