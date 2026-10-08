import { readEnv } from '../config/env.js';

/**
 * Environment check: `tsx src/scripts/check-env.ts` (dev) or `node dist/scripts/check-env.js`.
 * Validates the server environment exactly as the API does at startup and prints the
 * non-secret settings, so a deploy can stop before anything is restarted
 * (docs/deployment/production-setup.md). Never prints secrets.
 */
function main(): void {
  let env;
  try {
    env = readEnv();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  const summary = {
    APP_ENV: env.APP_ENV,
    NODE_ENV: env.NODE_ENV,
    API_HOST: env.API_HOST,
    API_PORT: env.API_PORT,
    WEB_ORIGIN: env.WEB_ORIGIN,
    ADMIN_ORIGIN: env.ADMIN_ORIGIN,
    LOG_LEVEL: env.LOG_LEVEL,
    DATABASE_SSL: env.DATABASE_SSL,
    DATABASE_MIGRATION_URL: env.DATABASE_MIGRATION_URL ? 'set' : 'not set (uses DATABASE_URL)',
    SMS_PROVIDER: env.SMS_PROVIDER,
    MEDIA_STORAGE: env.MEDIA_STORAGE,
    IDENTITY_PROVIDER: env.IDENTITY_PROVIDER,
    PAYMENT_PROVIDER: env.PAYMENT_PROVIDER,
  };
  process.stdout.write('Server environment is valid.\n');
  for (const [key, value] of Object.entries(summary)) {
    process.stdout.write(`  ${key}=${String(value)}\n`);
  }
}

main();
