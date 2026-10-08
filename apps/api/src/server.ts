import { createServer } from 'node:http';
import type { ServerEnv } from '@garba-partner/config/server';
import { API_PREFIX } from '@garba-partner/shared';
import { createApp } from './app.js';
import { createSequelize, databaseConfigFromEnv, pingDatabase } from './config/database.js';
import { readEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createApiLogStore, startApiLogRetention } from './modules/api-logs/api-log.store.js';
import { createTokenService } from './modules/auth/token.service.js';
import { createChatService } from './modules/chat/chat.service.js';
import { startNotificationJobs } from './modules/notifications/notification-jobs.js';
import { createChannelNotifier } from './modules/notifications/channel-notifier.js';
import { createNotifier } from './modules/notifications/notifications.service.js';
import { startSanctionExpiryJob } from './modules/safety/sanction-expiry.job.js';
import { createSafetyLogger } from './modules/safety/safety-log.service.js';
import { createSuspiciousActivityDetector } from './modules/safety/suspicious-activity.service.js';
import { startPaymentJobs } from './modules/payments/payment-jobs.js';
import { createPaymentsService } from './modules/payments/payments.service.js';
import { createMediaStorage } from './providers/media/index.js';
import { createMessageProviders } from './providers/messaging/index.js';
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
  if (env.LOG_OTP) {
    logger.warn(
      '[OTP] LOG_OTP is on: one-time codes are written to this log. Anyone who can read it can sign in as a member. Turn it off when you are done debugging.',
    );
  }
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
  const messaging = createMessageProviders(env, logger);
  // `api_logs` rows are queued and written in the background (docs/development/logging.md).
  const apiLogs = env.LOG_API_TO_DATABASE ? createApiLogStore({ logger }) : null;
  const server = createServer(
    createApp({
      env,
      logger,
      dependencies: {
        sequelize,
        sms: createSmsProvider(env),
        messaging,
        ...(apiLogs ? { apiLogs } : {}),
        media,
        realtime,
        payments: paymentGateway,
        pingDatabase: () => pingDatabase(sequelize),
      },
    }),
  );
  const safetyLog = createSafetyLogger({ ipHashSecret: env.OTP_HMAC_SECRET, logger });
  const notifier = createNotifier({
    sequelize,
    media,
    hub: realtime,
    logger,
    channels: createChannelNotifier({ sequelize, env, providers: messaging, logger }),
  });
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
  const stopApiLogRetention = apiLogs
    ? startApiLogRetention({ sequelize, retentionDays: env.API_LOG_RETENTION_DAYS, logger })
    : () => undefined;
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
    // PM2 (`wait_ready`) treats the process as up only now (docs/deployment/pm2.md).
    process.send?.('ready');
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
    stopApiLogRetention();
    // Closes every socket, then the HTTP server.
    void io.close();
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Error while closing HTTP server');
        process.exitCode = 1;
      }
      // Requests logged in the last moments are still in memory: store them before closing.
      void (apiLogs?.flush() ?? Promise.resolve())
        .then(() => sequelize.close())
        .catch((closeErr: unknown) => {
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
