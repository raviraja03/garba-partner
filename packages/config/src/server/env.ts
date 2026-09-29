import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export const APP_ENVS = ['development', 'staging', 'production'] as const;
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
/**
 * `dev` sends no SMS and returns the code in the send-otp response. It is only accepted when
 * APP_ENV=development. Real providers (e.g. MSG91) are added before launch.
 */
export const SMS_PROVIDERS = ['dev'] as const;
/**
 * `cloudinary` for real deployments. `local` stores images on disk and serves them from the API;
 * it is only accepted when APP_ENV=development (docs/users/cloudinary.md).
 */
export const MEDIA_STORAGES = ['cloudinary', 'local'] as const;
/**
 * Identity verification provider (docs/safety/identity-verification.md). `disabled` turns the
 * feature off (the status endpoint reports it unavailable). `mock` simulates a licensed KYC
 * provider and is only accepted when APP_ENV=development. Real providers are added by adapter.
 */
export const IDENTITY_PROVIDERS = ['disabled', 'mock'] as const;
/**
 * Event pass payments (docs/payments/razorpay.md). `disabled` turns online pass sales off.
 * `razorpay` needs the three RAZORPAY_* variables: TEST keys (rzp_test_) everywhere except
 * APP_ENV=production, which requires LIVE keys (rzp_live_).
 */
export const PAYMENT_PROVIDERS = ['disabled', 'razorpay'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];
export type AppEnv = (typeof APP_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];
export type SmsProvider = (typeof SMS_PROVIDERS)[number];
export type MediaStorageKind = (typeof MEDIA_STORAGES)[number];
export type IdentityProviderKind = (typeof IDENTITY_PROVIDERS)[number];
export type PaymentProviderKind = (typeof PAYMENT_PROVIDERS)[number];

/** Normalises an origin such as `https://example.com/` to `https://example.com`. */
const originSchema = z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin);

const postgresUrlSchema = z.url({ protocol: /^postgres(ql)?$/ });

/** At least 32 characters of secret material (e.g. 32 random bytes, base64-encoded). */
const secretSchema = z.string().min(32, 'must be at least 32 characters');

/** A base64-encoded 32-byte key (AES-256). */
const aes256KeySchema = z
  .string()
  .refine(
    (value) => Buffer.from(value, 'base64').length === 32,
    'must be 32 bytes, base64-encoded',
  );

/**
 * Server-side environment schema. Add every new server variable here AND to `.env.example`
 * in the same change (see docs/setup/environment-variables.md).
 */
export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVS).default('development'),
    APP_ENV: z.enum(APP_ENVS).default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    WEB_ORIGIN: originSchema.default('http://localhost:5173'),
    ADMIN_ORIGIN: originSchema.default('http://localhost:5174'),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),

    DATABASE_URL: postgresUrlSchema,
    /** Optional owner role used by the db CLI (migrations); defaults to DATABASE_URL. */
    DATABASE_MIGRATION_URL: postgresUrlSchema.optional(),
    DATABASE_SSL: z.stringbool().default(false),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    /** Separate, disposable database for integration tests. Never the development database. */
    TEST_DATABASE_URL: postgresUrlSchema.optional(),

    /** HMAC key for `users.phone_hash`. Long-lived: rotating it requires a re-hash migration. */
    PHONE_HASH_SECRET: secretSchema,
    /** AES-256-GCM key for `users.phone_encrypted`. */
    PHONE_ENCRYPTION_KEY: aes256KeySchema,
    PHONE_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).max(32_767).default(1),

    /** HMAC key for OTP codes and client IP hashes. */
    OTP_HMAC_SECRET: secretSchema,
    SMS_PROVIDER: z.enum(SMS_PROVIDERS).default('dev'),

    /** Member access tokens (JWT HS256, audience "garba-partner:app"). */
    JWT_ACCESS_SECRET: secretSchema,
    /** Admin access tokens (audience "garba-partner:admin"). Must differ from the member secret. */
    JWT_ADMIN_ACCESS_SECRET: secretSchema,
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    ADMIN_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24).default(12),
    ADMIN_SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(240).default(30),

    MEDIA_STORAGE: z.enum(MEDIA_STORAGES).default('local'),
    CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
    CLOUDINARY_API_KEY: z.string().min(1).optional(),
    CLOUDINARY_API_SECRET: z.string().min(1).optional(),
    /** Assets go to `<prefix>/<APP_ENV>/…`, keeping environments apart in one Cloudinary account. */
    CLOUDINARY_FOLDER_PREFIX: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and hyphens only')
      .default('garba-partner'),

    IDENTITY_PROVIDER: z.enum(IDENTITY_PROVIDERS).default('disabled'),
    /** HMAC key the provider uses to sign webhooks. Required unless IDENTITY_PROVIDER=disabled. */
    IDENTITY_WEBHOOK_SECRET: secretSchema.optional(),

    PAYMENT_PROVIDER: z.enum(PAYMENT_PROVIDERS).default('disabled'),
    /** Public key ID (sent to the browser for Checkout). */
    RAZORPAY_KEY_ID: z
      .string()
      .regex(
        /^rzp_(test|live)_[A-Za-z0-9]{6,40}$/,
        'must be a Razorpay key ID (rzp_test_… / rzp_live_…)',
      )
      .optional(),
    /** API key secret: server only. Signs checkout results; authenticates API calls. */
    RAZORPAY_KEY_SECRET: z.string().min(8).optional(),
    /** Webhook secret configured in the Razorpay dashboard. */
    RAZORPAY_WEBHOOK_SECRET: z.string().min(8).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.IDENTITY_PROVIDER !== 'disabled' && env.IDENTITY_WEBHOOK_SECRET === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['IDENTITY_WEBHOOK_SECRET'],
        message: 'is required when IDENTITY_PROVIDER is enabled',
      });
    }
    // The mock provider lets anyone mark themselves verified: never outside local development.
    if (env.IDENTITY_PROVIDER === 'mock' && env.APP_ENV !== 'development') {
      ctx.addIssue({
        code: 'custom',
        path: ['IDENTITY_PROVIDER'],
        message: '"mock" is only allowed when APP_ENV=development; configure a licensed provider',
      });
    }

    if (env.PAYMENT_PROVIDER === 'razorpay') {
      for (const key of [
        'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET',
        'RAZORPAY_WEBHOOK_SECRET',
      ] as const) {
        if (env[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'is required when PAYMENT_PROVIDER=razorpay',
          });
        }
      }
      // Real money only in production; production never runs on test keys.
      const live = env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') ?? false;
      if (live && env.APP_ENV !== 'production') {
        ctx.addIssue({
          code: 'custom',
          path: ['RAZORPAY_KEY_ID'],
          message: 'live keys are only allowed when APP_ENV=production; use test keys (rzp_test_)',
        });
      }
      if (!live && env.RAZORPAY_KEY_ID !== undefined && env.APP_ENV === 'production') {
        ctx.addIssue({
          code: 'custom',
          path: ['RAZORPAY_KEY_ID'],
          message: 'production requires live keys (rzp_live_)',
        });
      }
      if (
        env.RAZORPAY_WEBHOOK_SECRET !== undefined &&
        env.RAZORPAY_WEBHOOK_SECRET === env.RAZORPAY_KEY_SECRET
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['RAZORPAY_WEBHOOK_SECRET'],
          message: 'must differ from RAZORPAY_KEY_SECRET',
        });
      }
    }

    if (env.TEST_DATABASE_URL !== undefined && env.TEST_DATABASE_URL === env.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['TEST_DATABASE_URL'],
        message: 'must point to a different database than DATABASE_URL (tests truncate tables)',
      });
    }

    if (env.JWT_ACCESS_SECRET === env.JWT_ADMIN_ACCESS_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ADMIN_ACCESS_SECRET'],
        message: 'must differ from JWT_ACCESS_SECRET (member and admin tokens are separate)',
      });
    }
    // The dev OTP mechanism returns codes in API responses: never outside local development.
    if (env.SMS_PROVIDER === 'dev' && env.APP_ENV !== 'development') {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: '"dev" is only allowed when APP_ENV=development; configure a real SMS provider',
      });
    }

    if (env.MEDIA_STORAGE === 'local' && env.APP_ENV !== 'development') {
      ctx.addIssue({
        code: 'custom',
        path: ['MEDIA_STORAGE'],
        message: '"local" is only allowed when APP_ENV=development; use "cloudinary"',
      });
    }
    if (env.MEDIA_STORAGE === 'cloudinary') {
      for (const key of [
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET',
      ] as const) {
        if (env[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'is required when MEDIA_STORAGE=cloudinary',
          });
        }
      }
    }

    if (env.APP_ENV !== 'production') return;

    if (env.NODE_ENV !== 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['NODE_ENV'],
        message: 'must be "production" when APP_ENV is "production"',
      });
    }
    for (const key of ['WEB_ORIGIN', 'ADMIN_ORIGIN'] as const) {
      if (!env[key].startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'must use https in production' });
      }
    }
  });

export type ServerEnv = z.output<typeof serverEnvSchema>;

export interface LoadServerEnvOptions {
  /** Absolute path of a `.env` file to load. Missing files are ignored. */
  envFilePath?: string;
  /** Environment source. Defaults to `process.env`. */
  source?: NodeJS.ProcessEnv;
}

/**
 * Loads (optionally from a `.env` file) and validates the server environment.
 * Variables already present in the real environment take precedence over the file.
 * Throws with the names of invalid variables — never their values, which may be secrets.
 */
export function loadServerEnv(options: LoadServerEnvOptions = {}): ServerEnv {
  const source = options.source ?? process.env;

  if (options.envFilePath && existsSync(options.envFilePath)) {
    const fileVars = parseEnv(readFileSync(options.envFilePath, 'utf8'));
    for (const [key, value] of Object.entries(fileVars)) {
      if (source[key] === undefined && value !== undefined) source[key] = value;
    }
  }

  // `KEY=` (empty) means "not set", so optional variables fall back to their defaults.
  const input = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));

  const result = serverEnvSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid server environment configuration:\n${details}`);
  }
  return result.data;
}
