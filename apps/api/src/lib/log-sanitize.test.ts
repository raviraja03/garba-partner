import { describe, expect, it } from 'vitest';
import { loadServerEnv } from '@garba-partner/config/server';
import { createTestEnv } from '../test/helpers.js';
import { maskPhone, sanitizeLogText } from './log-sanitize.js';

describe('maskPhone', () => {
  it('keeps the country code and the last four digits', () => {
    expect(maskPhone('+919876543210')).toBe('+91XXXXXX3210');
    expect(maskPhone('9876543210')).toBe('XXXXXX3210');
  });

  it('never returns the digits of a short or odd value', () => {
    expect(maskPhone('12345')).toBe('XXXXX');
    expect(maskPhone('')).toBe('');
  });
});

describe('sanitizeLogText', () => {
  it('masks phone numbers, codes and email addresses', () => {
    const text = sanitizeLogText('Cannot reach +919876543210 (code 482913) for asha@example.com');
    expect(text).toBe('Cannot reach [digits] (code [digits]) for [email]');
  });

  it('leaves identifiers such as UUIDs and status codes readable', () => {
    const text = 'Match 6f1c2a34-9b1d-4c55-8a10-0123456789ab not found (404)';
    expect(sanitizeLogText(text)).toBe(text);
  });

  it('puts the text on one line and cuts it to the limit', () => {
    expect(sanitizeLogText('first line\n  second line')).toBe('first line second line');
    const long = sanitizeLogText('x'.repeat(500), 300);
    expect(long).toHaveLength(300);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('logging and channel settings', () => {
  const production = {
    NODE_ENV: 'production',
    APP_ENV: 'production',
    WEB_ORIGIN: 'https://example.in',
    ADMIN_ORIGIN: 'https://admin.example.in',
    MEDIA_STORAGE: 'cloudinary',
    CLOUDINARY_CLOUD_NAME: 'x',
    CLOUDINARY_API_KEY: 'x',
    CLOUDINARY_API_SECRET: 'x',
  };

  it('defaults: API logging on, OTP logging and both channels off', () => {
    const env = createTestEnv();
    expect(env.LOG_API_REQUESTS).toBe(true);
    expect(env.LOG_API_TO_DATABASE).toBe(true);
    expect(env.API_LOG_RETENTION_DAYS).toBe(30);
    expect(env.LOG_OTP).toBe(false);
    expect(env.SMS_ENABLED).toBe(false);
    expect(env.WHATSAPP_ENABLED).toBe(false);
  });

  it('reads the switches from the environment', () => {
    const env = createTestEnv({ LOG_OTP: 'true', LOG_API_REQUESTS: 'false', SMS_ENABLED: 'true' });
    expect(env.LOG_OTP).toBe(true);
    expect(env.LOG_API_REQUESTS).toBe(false);
    expect(env.SMS_ENABLED).toBe(true);
  });

  it('refuses SMS and WhatsApp outside development with the log provider (it sends nothing)', () => {
    const source = { ...process.env, ...createTestEnvSource(), ...production };
    for (const key of ['SMS_ENABLED', 'WHATSAPP_ENABLED']) {
      expect(() => loadServerEnv({ source: { ...source, [key]: 'true' } })).toThrow(key);
    }
  });
});

/** The raw variables behind `createTestEnv()` (secrets only), for building other environments. */
function createTestEnvSource(): Record<string, string> {
  return {
    DATABASE_URL: 'postgres://unused@127.0.0.1:5432/unused',
    PHONE_HASH_SECRET: 'test-phone-hash-secret-000000000000000000',
    PHONE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    OTP_HMAC_SECRET: 'test-otp-hmac-secret-0000000000000000000000',
    JWT_ACCESS_SECRET: 'test-member-jwt-secret-000000000000000000000',
    JWT_ADMIN_ACCESS_SECRET: 'test-admin-jwt-secret-0000000000000000000000',
  };
}
