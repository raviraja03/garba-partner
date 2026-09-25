import { ERROR_CODES, type ErrorCode, type ValidationIssue } from '@garba-partner/shared';

export interface AppErrorOptions {
  /** Overrides the default user-facing message of the code. Must not contain sensitive data. */
  message?: string;
  details?: ValidationIssue[];
  cause?: unknown;
}

/** Expected, client-facing error. The central error handler turns it into the error envelope. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: ValidationIssue[] | null;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? ERROR_CODES[code].message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = ERROR_CODES[code].httpStatus;
    this.details = options.details ?? null;
  }
}
