import type { ErrorRequestHandler } from 'express';
import type { ApiErrorBody } from '@garba-partner/shared';
import { AppError } from '../lib/app-error.js';

interface HttpErrorLike {
  status: number;
  type?: string;
}

function isHttpErrorLike(err: unknown): err is HttpErrorLike {
  return typeof err === 'object' && err !== null && typeof Reflect.get(err, 'status') === 'number';
}

/** Maps any thrown value to an AppError. Unknown errors become a generic INTERNAL_ERROR. */
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  // Errors raised by the Express body parsers (http-errors).
  if (isHttpErrorLike(err)) {
    if (err.type === 'entity.parse.failed') {
      return new AppError('VALIDATION_ERROR', { message: 'Request body is not valid JSON.' });
    }
    if (err.status === 413) return new AppError('PAYLOAD_TOO_LARGE');
    if (err.status >= 400 && err.status < 500) return new AppError('VALIDATION_ERROR');
  }

  return new AppError('INTERNAL_ERROR', { cause: err });
}

/**
 * Central error handler. Responses never include stack traces or internal error details;
 * those are logged together with the request ID instead.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  const appError = toAppError(err);

  if (appError.httpStatus >= 500) {
    req.log.error({ err }, 'Unhandled error');
  }

  if (res.headersSent) {
    next(err);
    return;
  }

  const body: ApiErrorBody = {
    success: false,
    message: appError.message,
    error: { code: appError.code, details: appError.details },
  };
  res.status(appError.httpStatus).json(body);
};
