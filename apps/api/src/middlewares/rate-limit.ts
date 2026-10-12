import { LIMITS } from '@garba-partner/shared';
import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError } from '../lib/app-error.js';

/**
 * Per-IP limiter (in-memory store). Security-critical OTP limits are ALSO enforced in the database
 * (they survive restarts); these limiters are a cheap first line against bursts and brute force.
 * `trust proxy` is set to loopback, so behind Nginx `req.ip` is the real client IP.
 */
export function createIpRateLimiter(options: { windowMs: number; limit: number }): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next, limiterOptions) => {
      next(new AppError('RATE_LIMITED', { retryAfterSeconds: limiterOptions.windowMs / 1000 }));
    },
  });
}

/**
 * Per-member limiter for authenticated endpoints (e.g. uploads). Use after authenticateMember;
 * falls back to the client IP if no member is attached.
 */
export function createMemberRateLimiter(options: {
  windowMs: number;
  limit: number;
}): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.auth?.userId ?? ipKeyGenerator(req.ip ?? 'unknown'),
    handler: (_req, _res, next, limiterOptions) => {
      next(new AppError('RATE_LIMITED', { retryAfterSeconds: limiterOptions.windowMs / 1000 }));
    },
  });
}

const MINUTE_MS = 60 * 1000;

/** Named limiters for the auth endpoints (docs/auth/authentication.md#rate-limits). */
export function createAuthRateLimiters() {
  return {
    // Sending the SMS is rate-limited by Firebase (reCAPTCHA, quotas); this caps how often one
    // address may exchange a token for a session.
    phoneLogin: createIpRateLimiter({
      windowMs: 15 * MINUTE_MS,
      limit: LIMITS.PHONE_LOGINS_PER_IP_PER_15_MIN,
    }),
    refresh: createIpRateLimiter({ windowMs: 15 * MINUTE_MS, limit: 60 }),
    adminLogin: createIpRateLimiter({ windowMs: 15 * MINUTE_MS, limit: 10 }),
  };
}

export type AuthRateLimiters = ReturnType<typeof createAuthRateLimiters>;
