import { isIP } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Request, RequestHandler, Response } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { ServerEnv } from '@garba-partner/config/server';
import { API_PREFIX } from '@garba-partner/shared';
import { redactUrl } from '../lib/logger.js';
import { requestIdOf, resolveRequestId } from '../lib/request-id.js';
import type { ApiLogSink } from '../modules/api-logs/api-log.store.js';

const HEALTH_PATH = `${API_PREFIX}/health`;
const USER_AGENT_MAX = 255;
const ENDPOINT_MAX = 255;

/** What the error handler leaves on `res.locals.apiError` for the request log. */
export interface ApiErrorInfo {
  code: string;
  /** Safe to log: the public message (4xx) or a sanitised internal message (5xx). */
  message: string;
}

interface Timed {
  startedAt?: Date;
  startedHr?: bigint;
}

const pathOf = (req: IncomingMessage): string =>
  ((req as Partial<Request>).originalUrl ?? req.url ?? '').split('?')[0]?.slice(0, ENDPOINT_MAX) ??
  '';

const errorOf = (res: ServerResponse): ApiErrorInfo | undefined =>
  ((res as Response).locals as { apiError?: ApiErrorInfo } | undefined)?.apiError;

/** Uptime probes and CORS preflights would only be noise. */
const isIgnored = (req: IncomingMessage): boolean =>
  req.method === 'OPTIONS' || pathOf(req) === HEALTH_PATH;

const durationMs = (res: ServerResponse): number => {
  const started = ((res as Response).locals as Timed | undefined)?.startedHr;
  return started === undefined ? 0 : Number((process.hrtime.bigint() - started) / 1_000_000n);
};

/**
 * The searchable line: `[API] POST /api/v1/auth/send-otp | 200 | 145ms | requestId=… | userId=…`
 * (`[API ERROR]` and `| error=…` for 4xx and 5xx). Path only: never the query string or a body.
 */
function line(req: IncomingMessage, res: ServerResponse): string {
  const express = req as Request;
  const failed = res.statusCode >= 400;
  const who = express.auth?.userId ?? (express.admin ? `admin:${express.admin.adminId}` : '-');
  const parts = [
    `${failed ? '[API ERROR]' : '[API]'} ${req.method ?? '?'} ${pathOf(req)}`,
    String(res.statusCode),
    `${String(durationMs(res))}ms`,
    `requestId=${requestIdOf(req)}`,
    `userId=${who}`,
  ];
  if (failed) parts.push(`error=${errorOf(res)?.message ?? 'Request failed'}`);
  return parts.join(' | ');
}

/**
 * Central API logging (docs/development/logging.md). Mounted first in `app.ts`, so every
 * request passes through it, including ones that fail before reaching a route.
 *
 * 1. Gives each request an ID (`req.id`, echoed as `X-Request-Id`) and a child logger
 *    (`req.log`) that stamps that ID on everything logged while handling it.
 * 2. Writes one line per finished request to the server log (`LOG_API_REQUESTS`).
 * 3. Hands the same facts to `sink` for the `api_logs` table (`LOG_API_TO_DATABASE`). The sink
 *    queues and writes in the background, so the response never waits for the database.
 *
 * Bodies, headers, cookies and query strings are never logged: they carry phone numbers,
 * one-time codes and tokens.
 */
export function createApiLogger(deps: {
  env: Pick<ServerEnv, 'LOG_API_REQUESTS'>;
  logger: Logger;
  sink?: ApiLogSink | undefined;
}): RequestHandler[] {
  const { env, logger, sink } = deps;

  const timer: RequestHandler = (req, res, next) => {
    const timed = res.locals as Timed;
    timed.startedAt = new Date();
    timed.startedHr = process.hrtime.bigint();

    if (sink && !isIgnored(req)) {
      res.on('finish', () => {
        const error = errorOf(res);
        const ip = req.ip && isIP(req.ip) ? req.ip : null;
        sink.record({
          requestId: requestIdOf(req),
          userId: req.auth?.userId ?? null,
          adminId: req.admin?.adminId ?? null,
          method: req.method.slice(0, 10),
          endpoint: pathOf(req),
          statusCode: res.statusCode,
          responseTimeMs: durationMs(res),
          ipAddress: ip,
          userAgent: req.get('User-Agent')?.slice(0, USER_AGENT_MAX) ?? null,
          requestTimestamp: timed.startedAt ?? new Date(),
          responseTimestamp: new Date(),
          success: res.statusCode < 400,
          errorCode: error?.code ?? null,
          errorMessage: res.statusCode >= 400 ? (error?.message ?? 'Request failed') : null,
        });
      });
    }
    next();
  };

  const http = pinoHttp({
    logger,
    genReqId: resolveRequestId,
    // Query strings can carry phone numbers (admin search): never log them in the URL.
    serializers: {
      req: (req: { url?: string }) => ({ ...req, url: redactUrl(req.url) }),
    },
    autoLogging: env.LOG_API_REQUESTS ? { ignore: isIgnored } : false,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: line,
    customErrorMessage: line,
    // Structured fields, for log tools that filter on keys rather than text.
    customProps: (req, res) => ({
      requestId: requestIdOf(req),
      userId: (req as Request).auth?.userId ?? null,
      adminId: (req as Request).admin?.adminId ?? null,
      durationMs: durationMs(res),
      result: res.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
    }),
  });

  return [timer, http];
}
