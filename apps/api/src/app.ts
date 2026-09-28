import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { ServerEnv } from '@garba-partner/config/server';
import { API_PREFIX } from '@garba-partner/shared';
import { resolveRequestId } from './lib/request-id.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { LOCAL_MEDIA_DIRECTORY, LOCAL_MEDIA_ROUTE } from './providers/media/index.js';
import { createApiRouter, type ApiDependencies } from './routes.js';

export interface CreateAppOptions {
  env: ServerEnv;
  logger: Logger;
  /** External dependencies (database, SMS, ...), injected so tests can replace them. */
  dependencies: ApiDependencies;
}

const HEALTH_PATH = `${API_PREFIX}/health`;

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
      autoLogging: { ignore: (req) => req.url === HEALTH_PATH },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN], credentials: true }));
  app.use(express.json({ limit: '100kb' }));
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
