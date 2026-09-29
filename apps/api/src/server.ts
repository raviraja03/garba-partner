import { createServer } from 'node:http';
import type { ServerEnv } from '@garba-partner/config/server';
import { API_PREFIX } from '@garba-partner/shared';
import { createApp } from './app.js';
import { createSequelize, databaseConfigFromEnv, pingDatabase } from './config/database.js';
import { readEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createTokenService } from './modules/auth/token.service.js';
import { createChatService } from './modules/chat/chat.service.js';
import { startNotificationJobs } from './modules/notifications/notification-jobs.js';
import { createNotifier } from './modules/notifications/notifications.service.js';
import { startSanctionExpiryJob } from './modules/safety/sanction-expiry.job.js';
import { createSafetyLogger } from './modules/safety/safety-log.service.js';
import { createSuspiciousActivityDetector } from './modules/safety/suspicious-activity.service.js';
import { startPaymentJobs } from './modules/payments/payment-jobs.js';
import { createPaymentsService } from './modules/payments/payments.service.js';
import { createMediaStorage } from './providers/media/index.js';
import { createPaymentGateway } from './providers/payments/index.js';
import { createSmsProvider } from './providers/sms/index.js';
import { createRealtimeHub } from './realtime/hub.js';
import { attachSocketServer } from './realtime/socket-server.js';

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

  const media = createMediaStorage(env);
  const realtime = createRealtimeHub();
  const paymentGateway = createPaymentGateway(env, logger);
  const server = createServer(
    createApp({
      env,
      logger,
      dependencies: {
        sequelize,
        sms: createSmsProvider(env),
        media,
        realtime,
        payments: paymentGateway,
        pingDatabase: () => pingDatabase(sequelize),
      },
    }),
  );
  const safetyLog = createSafetyLogger({ ipHashSecret: env.OTP_HMAC_SECRET, logger });
  const notifier = createNotifier({ sequelize, media, hub: realtime, logger });
  // Socket.IO shares the HTTP server (path /socket.io) and the same services as REST.
  const io = attachSocketServer(server, {
    env,
    logger,
    tokens: createTokenService(env),
    chat: createChatService({
      sequelize,
      media,
      hub: realtime,
      suspicious: createSuspiciousActivityDetector({ sequelize, safetyLog, logger }),
      notifier,
    }),
    hub: realtime,
  });

  // Timed suspensions and chat restrictions end on their own (docs/safety/admin-actions.md).
  const stopSanctionExpiry = startSanctionExpiryJob({ sequelize, safetyLog, logger });
  // Event reminders and notification retention (docs/notifications/notifications.md).
  const stopNotificationJobs = startNotificationJobs({ sequelize, notifier, logger });
  // Expire unpaid orders after reconciling them with Razorpay (docs/payments/webhook.md).
  const stopPaymentJobs = paymentGateway
    ? startPaymentJobs({
        payments: createPaymentsService({
          sequelize,
          env,
          gateway: paymentGateway,
          notifier,
          logger,
        }),
        logger,
      })
    : () => undefined;

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

    stopSanctionExpiry();
    stopNotificationJobs();
    stopPaymentJobs();
    // Closes every socket, then the HTTP server.
    void io.close();
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
