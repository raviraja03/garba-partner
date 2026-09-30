import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { ServerEnv } from '@garba-partner/config/server';
import { API_PREFIX, CSRF_HEADER, REQUEST_ID_HEADER } from '@garba-partner/shared';
import { redactUrl } from './lib/logger.js';
import { resolveRequestId } from './lib/request-id.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { RAZORPAY_WEBHOOK_PATH } from './modules/payments/payments.routes.js';
import { LOCAL_MEDIA_DIRECTORY, LOCAL_MEDIA_ROUTE } from './providers/media/index.js';
import { createApiRouter, type ApiDependencies } from './routes.js';

export interface CreateAppOptions {
  env: ServerEnv;
  logger: Logger;
  /** External dependencies (database, SMS, ...), injected so tests can replace them. */
  dependencies: ApiDependencies;
}

const HEALTH_PATH = `${API_PREFIX}/health`;
const WEBHOOK_PATH = `${API_PREFIX}${RAZORPAY_WEBHOOK_PATH}`;

/** Builds the Express application. Kept free of side effects so tests can create instances. */
export function createApp({ env, logger, dependencies }: CreateAppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  // Nginx runs on the same host; trust X-Forwarded-* only from loopback.
  app.set('trust proxy', 'loopback');

  app.use(
    pinoHttp({
      logger,
      genReqId: resolveRequestId,
      // Query strings can carry phone numbers (admin search): never log them in the URL.
      serializers: {
        req: (req: { url?: string }) => ({ ...req, url: redactUrl(req.url) }),
      },
      autoLogging: { ignore: (req) => req.url === HEALTH_PATH },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );
  app.use(
    helmet({
      // 1 year; Nginx sends the same header in production (docs/security/security-best-practices.md).
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  // Strict CORS: only our two front ends, only the methods and headers they use.
  app.use(
    cors({
      origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        CSRF_HEADER,
        'Idempotency-Key',
        REQUEST_ID_HEADER,
      ],
      exposedHeaders: [REQUEST_ID_HEADER, 'Retry-After'],
      maxAge: 600,
    }),
  );
  // API responses carry personal data and tokens: never cached by browsers or proxies unless a
  // public route (events, cities) explicitly opts in with its own Cache-Control.
  app.use(API_PREFIX, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    express.json({
      limit: '100kb',
      // Webhook signatures are computed over the exact bytes received: keep them for that path.
      verify: (req, _res, buffer) => {
        if (req.url === WEBHOOK_PATH) (req as express.Request).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(cookieParser());

  if (env.MEDIA_STORAGE === 'local') {
    // Development only (the env schema forbids local storage elsewhere).
    app.use(
      LOCAL_MEDIA_ROUTE,
      express.static(LOCAL_MEDIA_DIRECTORY, { index: false, dotfiles: 'deny', fallthrough: false }),
    );
  }
  app.use(API_PREFIX, createApiRouter({ env, logger, dependencies }));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
