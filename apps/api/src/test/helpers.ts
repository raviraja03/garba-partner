import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { pino } from 'pino';
import sharp from 'sharp';
import request, { type Response } from 'supertest';
import type { Sequelize } from 'sequelize-typescript';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { loadServerEnv, type ServerEnv } from '@garba-partner/config/server';
import type { AdminRole } from '@garba-partner/shared';
import { createApp } from '../app.js';
import { createSequelize } from '../config/database.js';
import { hashPassword } from '../lib/passwords.js';
import { AdminUser } from '../models/index.js';
import type { MediaStorage } from '../providers/media/index.js';
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

/** In-memory media storage that records what was stored and deleted. */
export interface FakeMediaStorage extends MediaStorage {
  stored: Map<string, Buffer>;
  destroyed: string[];
  failNextUpload: boolean;
}

export function createFakeMediaStorage(): FakeMediaStorage {
  let counter = 0;
  const storage: FakeMediaStorage = {
    name: 'fake',
    stored: new Map(),
    destroyed: [],
    failNextUpload: false,
    upload(image, folder) {
      if (storage.failNextUpload) {
        storage.failNextUpload = false;
        return Promise.reject(new Error('upload failed'));
      }
      counter += 1;
      const publicId = `test/${folder}/img${String(counter)}`;
      storage.stored.set(publicId, image.buffer);
      return Promise.resolve({ publicId, width: image.width, height: image.height });
    },
    destroy(publicId) {
      storage.destroyed.push(publicId);
      storage.stored.delete(publicId);
      return Promise.resolve();
    },
    url: (publicId, variant) => `https://media.test/${variant}/${publicId}`,
  };
  return storage;
}

export function createTestApp(options: {
  sequelize: Sequelize;
  env?: ServerEnv;
  sms?: SmsProvider;
  media?: MediaStorage;
  pingDatabase?: () => Promise<boolean>;
}): Express {
  return createApp({
    env: options.env ?? createTestEnv(),
    logger: pino({ level: 'silent' }),
    dependencies: {
      sequelize: options.sequelize,
      sms: options.sms ?? devSmsProvider,
      media: options.media ?? createFakeMediaStorage(),
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
    // Reference data (cities, areas) is kept; everything user- and admin-generated is emptied.
    await sequelize?.query(
      'TRUNCATE users, otp_requests, admin_users, events, event_organizers, event_attendances, safety_logs CASCADE',
    );
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

// --- Login helpers (real API flows) -------------------------------------------------------------

let phoneCounter = 0;

/** A fresh, obviously fake Indian mobile number (10 digits). */
export function newTestPhone(): string {
  phoneCounter += 1;
  return `99998${String(phoneCounter).padStart(5, '0')}`;
}

/** Logs in through send-otp + verify-otp (dev OTP) and returns the access token. */
export async function loginMember(
  app: Express,
  ip: string,
  phone: string = newTestPhone(),
): Promise<{ accessToken: string; userId: string; phone: string }> {
  const sent = await request(app)
    .post('/api/v1/auth/send-otp')
    .set('X-Forwarded-For', ip)
    .send({ phone });
  const code = (sent.body as { data?: { devOtp?: string } }).data?.devOtp;
  if (!code) throw new Error(`send-otp failed: ${String(sent.status)}`);
  const verified = await request(app)
    .post('/api/v1/auth/verify-otp')
    .set('X-Forwarded-For', ip)
    .send({ phone, code });
  const data = (verified.body as { data?: { accessToken: string; user: { id: string } } }).data;
  if (!data) throw new Error(`verify-otp failed: ${String(verified.status)}`);
  return { accessToken: data.accessToken, userId: data.user.id, phone };
}

export const TEST_ADMIN_PASSWORD = 'test-admin-password-2026';
let adminHash: Promise<string> | undefined;

/** Creates an admin with the given role and logs in through the admin API. */
export async function loginAdmin(
  app: Express,
  ip: string,
  role: AdminRole,
): Promise<{ accessToken: string; adminId: string }> {
  adminHash ??= hashPassword(TEST_ADMIN_PASSWORD);
  const email = `${role}.${randomUUID().slice(0, 8)}@garbapartner.test`;
  const admin = await AdminUser.create({
    email,
    name: `Test ${role}`,
    role,
    passwordHash: await adminHash,
  });
  const res = await request(app)
    .post('/api/v1/admin/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email, password: TEST_ADMIN_PASSWORD });
  const data = (res.body as { data?: { accessToken: string } }).data;
  if (!data) throw new Error(`admin login failed: ${String(res.status)}`);
  return { accessToken: data.accessToken, adminId: admin.id };
}

// --- Test images ----------------------------------------------------------------------------

/** Generates an image; `gps: true` embeds EXIF with GPS coordinates (to prove they are stripped). */
export async function makeImage(options: {
  width: number;
  height: number;
  format?: 'jpeg' | 'png' | 'webp' | 'gif';
  gps?: boolean;
}): Promise<Buffer> {
  let image = sharp({
    create: { width: options.width, height: options.height, channels: 3, background: '#f97a07' },
  });
  if (options.gps) {
    image = image.withExif({
      IFD0: { Copyright: 'test-owner' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '23/1 2/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '72/1 34/1 0/1',
      },
    });
  }
  switch (options.format ?? 'jpeg') {
    case 'png':
      return image.png().toBuffer();
    case 'webp':
      return image.webp().toBuffer();
    case 'gif':
      return image.gif().toBuffer();
    case 'jpeg':
      return image.jpeg().toBuffer();
  }
}
