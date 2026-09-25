import { pino, type Logger } from 'pino';
import type { ServerEnv } from '@garba-partner/config/server';

/**
 * Paths that must never reach the logs. Extend this list whenever a new sensitive field is
 * introduced (see docs/architecture/security-architecture.md §11).
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.otp',
  '*.code',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.phone',
];

export function createLogger(env: Pick<ServerEnv, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: { service: 'garba-partner-api' },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    ...(env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:HH:MM:ss',
              ignore: 'pid,hostname,service',
            },
          },
        }
      : {}),
  });
}
