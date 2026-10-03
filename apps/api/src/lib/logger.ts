import { pino, type DestinationStream, type Logger } from 'pino';
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
  '*.secret',
  '*.phone',
  // Query strings (e.g. admin user search by phone number: QA finding, see docs/testing/security-testing.md)
  'req.query.q',
  'req.query.phone',
  'req.query.code',
  'req.query.token',
  // Sequelize errors carry the SQL (with inlined replacements), bind values and, for unique
  // violations, the conflicting values (`fields`, `errors`, `detail`), which can hold search
  // terms or personal data. The message, code and stack are enough to debug.
  'err.sql',
  'err.parameters',
  'err.fields',
  'err.errors',
  'err.parent.sql',
  'err.parent.parameters',
  'err.parent.detail',
  'err.original.sql',
  'err.original.parameters',
  'err.original.detail',
];

/** Query parameters whose values never reach the logs (they can hold phone numbers or secrets). */
const SENSITIVE_QUERY_KEYS = new Set(['q', 'phone', 'code', 'token']);

/** `/admin/users?q=9876543210&limit=20` → `/admin/users?q=%5BREDACTED%5D&limit=20`. */
export function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const index = url.indexOf('?');
  if (index < 0) return url;
  const params = new URLSearchParams(url.slice(index + 1));
  let changed = false;
  for (const key of new Set(params.keys())) {
    if (SENSITIVE_QUERY_KEYS.has(key)) {
      params.set(key, '[REDACTED]');
      changed = true;
    }
  }
  return changed ? `${url.slice(0, index)}?${params.toString()}` : url;
}

/** `destination` is for tests that inspect log output (no pretty transport then). */
export function createLogger(
  env: Pick<ServerEnv, 'LOG_LEVEL' | 'NODE_ENV'>,
  destination?: DestinationStream,
): Logger {
  const options = {
    level: env.LOG_LEVEL,
    base: { service: 'garba-partner-api' },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  };
  if (destination) return pino(options, destination);
  return pino({
    ...options,
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
