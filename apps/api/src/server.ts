import { createServer } from 'node:http';
import type { ServerEnv } from '@garba-partner/config/server';
import { API_PREFIX } from '@garba-partner/shared';
import { createApp } from './app.js';
import { readEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function start(): void {
  let env: ServerEnv;
  try {
    env = readEnv();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  const logger = createLogger(env);
  const server = createServer(createApp({ env, logger }));

  server.on('error', (err: NodeJS.ErrnoException) => {
    const message =
      err.code === 'EADDRINUSE'
        ? `Port ${String(env.API_PORT)} is already in use`
        : 'HTTP server error';
    logger.fatal({ err }, message);
    process.exitCode = 1;
  });

  server.listen(env.API_PORT, env.API_HOST, () => {
    logger.info(
      `API listening on http://${env.API_HOST}:${String(env.API_PORT)}${API_PREFIX} (${env.APP_ENV})`,
    );
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    const forceExit = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Error while closing HTTP server');
        process.exitCode = 1;
      }
    });
    server.closeIdleConnections();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start();
