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
// Visible to global-setup.ts (main process) as well as to test workers.
if (testDbUrl) process.env.TEST_DATABASE_URL = testDbUrl;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/test/global-setup.ts'],
    // Integration test files share one database, so files run one at a time.
    fileParallelism: false,
    // Integration tests create members through the real API (OTP, onboarding, Argon2, image
    // processing); 5 s was flaky on slower machines (QA finding). Still catches real hangs.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Integration tests are skipped when no test database is configured.
    env: testDbUrl ? { TEST_DATABASE_URL: testDbUrl } : {},
  },
});
