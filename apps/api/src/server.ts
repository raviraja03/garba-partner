import { createServer } from 'node:http';
import type { ServerEnv } from '@garba-partner/config/server';
import { API_PREFIX } from '@garba-partner/shared';
import { createApp } from './app.js';
import { createSequelize, databaseConfigFromEnv, pingDatabase } from './config/database.js';
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
  const sequelize = createSequelize(databaseConfigFromEnv(env));

  // The API starts even if the database is down; /health reports 503 until it recovers.
  sequelize.authenticate().then(
    () => {
      logger.info('Database connection established');
    },
    (err: unknown) => {
      logger.error({ err }, 'Database connection failed; /health will report 503');
    },
  );

  const server = createServer(
    createApp({ env, logger, dependencies: { pingDatabase: () => pingDatabase(sequelize) } }),
  );

  server.on('error', (err: NodeJS.ErrnoException) => {
    const message =
      err.code === 'EADDRINUSE'
        ? `Port ${String(env.API_PORT)} is already in use`
        : 'HTTP server error';
    logger.fatal({ err }, message);
    process.exitCode = 1;
    void sequelize.close();
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
      sequelize.close().catch((closeErr: unknown) => {
        logger.error({ err: closeErr }, 'Error while closing database connections');
        process.exitCode = 1;
      });
    });
    server.closeIdleConnections();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start();
