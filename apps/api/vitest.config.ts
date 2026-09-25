import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

const rootEnvFile = new URL('../../.env', import.meta.url);

/** Only TEST_DATABASE_URL is taken from the root .env; a real environment variable wins. */
function testDatabaseUrl(): string | undefined {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!existsSync(rootEnvFile)) return undefined;
  return parseEnv(readFileSync(rootEnvFile, 'utf8')).TEST_DATABASE_URL;
}

const testDbUrl = testDatabaseUrl();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests are skipped when no test database is configured.
    env: testDbUrl ? { TEST_DATABASE_URL: testDbUrl } : {},
  },
});
