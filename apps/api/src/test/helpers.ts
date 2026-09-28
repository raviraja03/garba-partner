import type { Express } from 'express';
import { pino } from 'pino';
import type { Response } from 'supertest';
import type { Sequelize } from 'sequelize-typescript';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { loadServerEnv, type ServerEnv } from '@garba-partner/config/server';
import { createApp } from '../app.js';
import { createSequelize } from '../config/database.js';
import { devSmsProvider } from '../providers/sms/dev.sms.js';
import type { SmsProvider } from '../providers/sms/index.js';

/** Disposable integration-test database (see docs/database/database-setup.md). */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
export const hasTestDatabase = TEST_DATABASE_URL !== '';

/** Fixed, obviously fake secrets for tests only. */
export function createTestEnv(overrides: Record<string, string> = {}): ServerEnv {
  return loadServerEnv({
    source: {
      NODE_ENV: 'test',
      APP_ENV: 'development',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL || 'postgres://unused@127.0.0.1:5432/unused',
      PHONE_HASH_SECRET: 'test-phone-hash-secret-000000000000000000',
      PHONE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      OTP_HMAC_SECRET: 'test-otp-hmac-secret-0000000000000000000000',
      JWT_ACCESS_SECRET: 'test-member-jwt-secret-000000000000000000000',
      JWT_ADMIN_ACCESS_SECRET: 'test-admin-jwt-secret-0000000000000000000000',
      ...overrides,
    },
  });
}

export function createTestApp(options: {
  sequelize: Sequelize;
  env?: ServerEnv;
  sms?: SmsProvider;
  pingDatabase?: () => Promise<boolean>;
}): Express {
  return createApp({
    env: options.env ?? createTestEnv(),
    logger: pino({ level: 'silent' }),
    dependencies: {
      sequelize: options.sequelize,
      sms: options.sms ?? devSmsProvider,
      pingDatabase: options.pingDatabase ?? (() => Promise.resolve(true)),
    },
  });
}

/**
 * Registers hooks that connect to the test database (schema migrated once by global-setup.ts)
 * and empty every table before each test. Returns a getter for the Sequelize instance.
 */
export function useTestDatabase(): () => Sequelize {
  let sequelize: Sequelize | undefined;

  beforeAll(() => {
    sequelize = createSequelize({ url: TEST_DATABASE_URL, ssl: false, poolMax: 4 });
  });
  afterAll(async () => {
    await sequelize?.close();
  });
  beforeEach(async () => {
    await sequelize?.query('TRUNCATE users, otp_requests, admin_users CASCADE');
  });

  return () => {
    if (!sequelize) throw new Error('Test database is not initialised');
    return sequelize;
  };
}

let ipCounter = 0;

/** A fresh client IP per call, so per-IP rate limits never couple unrelated tests. */
export function uniqueIp(): string {
  ipCounter += 1;
  return `10.0.${String(Math.floor(ipCounter / 250))}.${String((ipCounter % 250) + 1)}`;
}

/** Returns `name=value` for a Set-Cookie header, or undefined. */
export function getCookie(res: Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match?.split(';')[0];
}

/** Full Set-Cookie line (with attributes) for assertions. */
export function getSetCookieLine(res: Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}
