import { describe, expect, it } from 'vitest';
import { serverEnvSchema } from '@garba-partner/config/server';

/** Boot-time security rules of the server environment (docs/security/security-checklist.md). */
describe('security environment rules', () => {
  const base = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/app',
    PHONE_HASH_SECRET: 'x'.repeat(40),
    PHONE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
    OTP_HMAC_SECRET: 'y'.repeat(40),
    JWT_ACCESS_SECRET: 'm'.repeat(40),
    JWT_ADMIN_ACCESS_SECRET: 'a'.repeat(40),
  };
  const issues = (env: Record<string, string | undefined>) => {
    const result = serverEnvSchema.safeParse({ ...base, ...env });
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  };
  const production = {
    APP_ENV: 'production',
    NODE_ENV: 'production',
    WEB_ORIGIN: 'https://garbapartner.example',
    ADMIN_ORIGIN: 'https://admin.garbapartner.example',
    MEDIA_STORAGE: 'cloudinary',
    CLOUDINARY_CLOUD_NAME: 'cloud',
    CLOUDINARY_API_KEY: 'key',
    CLOUDINARY_API_SECRET: 'secret',
  };

  it('accepts a valid development configuration', () => {
    expect(issues({})).toEqual([]);
  });

  it('requires a 32-byte admin TOTP key, different from the phone key', () => {
    expect(issues({ TOTP_ENCRYPTION_KEY: undefined })).toContain('TOTP_ENCRYPTION_KEY');
    expect(issues({ TOTP_ENCRYPTION_KEY: Buffer.alloc(16, 2).toString('base64') })).toContain(
      'TOTP_ENCRYPTION_KEY',
    );
    expect(issues({ TOTP_ENCRYPTION_KEY: base.PHONE_ENCRYPTION_KEY })).toContain(
      'TOTP_ENCRYPTION_KEY',
    );
  });

  it('requires separate, long member and admin JWT secrets', () => {
    expect(issues({ JWT_ADMIN_ACCESS_SECRET: base.JWT_ACCESS_SECRET })).toContain(
      'JWT_ADMIN_ACCESS_SECRET',
    );
    expect(issues({ JWT_ACCESS_SECRET: 'short' })).toContain('JWT_ACCESS_SECRET');
  });

  it('refuses development-only mechanisms outside development', () => {
    const staging = issues({ ...production, APP_ENV: 'staging', MEDIA_STORAGE: 'local' });
    expect(staging).toContain('SMS_PROVIDER'); // the dev provider returns OTPs in responses
    expect(staging).toContain('MEDIA_STORAGE');
  });

  it('requires https origins and NODE_ENV=production in production', () => {
    const result = issues({
      ...production,
      NODE_ENV: 'development',
      WEB_ORIGIN: 'http://garbapartner.example',
    });
    expect(result).toEqual(expect.arrayContaining(['NODE_ENV', 'WEB_ORIGIN']));
    expect(result).not.toContain('ADMIN_ORIGIN');
  });
});
