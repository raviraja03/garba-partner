import type { RequestHandler } from 'express';
import { CSRF_HEADER } from '@garba-partner/shared';
import { AppError } from '../lib/app-error.js';

/**
 * CSRF protection for endpoints authenticated by a cookie (refresh). Requires the custom header
 * (cross-site pages cannot send it without a CORS preflight, which our CORS policy rejects) and,
 * when the browser sends an Origin, that it is one of ours. SameSite=Strict cookies are the
 * first line of defence; this is the second.
 */
export function requireCsrfHeader(
  expectedValue: string,
  allowedOrigins: readonly string[],
): RequestHandler {
  return (req, _res, next) => {
    if (req.get(CSRF_HEADER) !== expectedValue) {
      throw new AppError('FORBIDDEN', { message: 'Missing or invalid request header.' });
    }
    const origin = req.get('Origin');
    if (origin !== undefined && !allowedOrigins.includes(origin)) {
      throw new AppError('FORBIDDEN', { message: 'Request origin is not allowed.' });
    }
    next();
  };
}
