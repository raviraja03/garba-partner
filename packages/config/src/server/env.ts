import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export const APP_ENVS = ['development', 'staging', 'production'] as const;
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
/**
 * Who texts login codes. `dev` sends no SMS and returns the code in the send-otp response; it
 * is only accepted when APP_ENV=development. `msg91` sends a real SMS through MSG91.
 */
export const SMS_PROVIDERS = ['dev', 'msg91'] as const;
/**
 * Who delivers notifications by SMS / WhatsApp. `log` writes them to the server log instead of
 * sending (development only). `msg91` sends them through MSG91.
 */
export const MESSAGING_PROVIDERS = ['log', 'msg91'] as const;
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
export type MessagingProviderKind = (typeof MESSAGING_PROVIDERS)[number];
export type MediaStorageKind = (typeof MEDIA_STORAGES)[number];
export type IdentityProviderKind = (typeof IDENTITY_PROVIDERS)[number];
export type PaymentProviderKind = (typeof PAYMENT_PROVIDERS)[number];

/** Normalises an origin such as `https://example.com/` to `https://example.com`. */
const originSchema = z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin);

const postgresUrlSchema = z.url({ protocol: /^postgres(ql)?$/ });

/** At least 32 characters of secret material (e.g. 32 random bytes, base64-encoded). */
const secretSchema = z.string().min(32, 'must be at least 32 characters');

/** `type:template,type:template` (which MSG91 template to use for each notification type). */
const templateMapSchema = z
  .string()
  .regex(
    /^\s*[a-z_]+\s*:\s*[\w-]+\s*(,\s*[a-z_]+\s*:\s*[\w-]+\s*)*$/,
    'must look like interest_received:TEMPLATE,match_created:TEMPLATE',
  );

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
    /** One `[API]` line per request in the server log (docs/development/logging.md). */
    LOG_API_REQUESTS: z.stringbool().default(true),
    /** Also store every request in the `api_logs` table (written in batches, off the request path). */
    LOG_API_TO_DATABASE: z.stringbool().default(true),
    /** `api_logs` rows older than this are deleted daily. */
    API_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    /**
     * Prints each one-time code to the server log (`[OTP]` line, phone masked). For debugging
     * only: anyone who can read the log can sign in as that member. Off unless set to true.
     */
    LOG_OTP: z.stringbool().default(false),

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

    /**
     * Send member notifications by SMS / WhatsApp as well as in the app
     * (docs/notifications/notification-channels.md). With MESSAGING_PROVIDER=log nothing is
     * really sent, so that combination is refused outside APP_ENV=development.
     */
    SMS_ENABLED: z.stringbool().default(false),
    WHATSAPP_ENABLED: z.stringbool().default(false),
    MESSAGING_PROVIDER: z.enum(MESSAGING_PROVIDERS).default('log'),

    /** MSG91 (docs/notifications/msg91.md). The auth key is a secret: server only. */
    MSG91_AUTH_KEY: z.string().min(10).optional(),
    /** Flow template for login codes: one variable, `##otp##`. Required when SMS_PROVIDER=msg91. */
    MSG91_OTP_TEMPLATE_ID: z
      .string()
      .regex(/^[\w-]{6,64}$/, 'must be a MSG91 template ID')
      .optional(),
    /** Flow template ID per notification type, for SMS notifications. */
    MSG91_SMS_TEMPLATE_IDS: templateMapSchema.optional(),
    /** The WhatsApp Business number connected in MSG91: digits with country code. */
    MSG91_WHATSAPP_NUMBER: z
      .string()
      .regex(/^\+?\d{8,15}$/, 'digits with country code')
      .optional(),
    /** Approved WhatsApp template name per notification type. */
    MSG91_WHATSAPP_TEMPLATES: templateMapSchema.optional(),
    MSG91_WHATSAPP_LANGUAGE: z
      .string()
      .regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'e.g. en or en_US')
      .default('en'),
    /** Only if MSG91 shows a namespace for your templates. */
    MSG91_WHATSAPP_NAMESPACE: z.string().min(1).optional(),

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

    // The log provider writes to the log instead of sending: recording those as "sent" outside
    // local development would be false.
    for (const key of ['SMS_ENABLED', 'WHATSAPP_ENABLED'] as const) {
      if (env[key] && env.MESSAGING_PROVIDER === 'log' && env.APP_ENV !== 'development') {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message:
            'needs MESSAGING_PROVIDER=msg91 outside development ("log" does not send anything)',
        });
      }
    }
    const required = (key: keyof typeof env, when: string): void => {
      if (env[key] === undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: `is required when ${when}` });
      }
    };
    if (env.SMS_PROVIDER === 'msg91') {
      required('MSG91_AUTH_KEY', 'SMS_PROVIDER=msg91');
      required('MSG91_OTP_TEMPLATE_ID', 'SMS_PROVIDER=msg91');
    }
    if (env.MESSAGING_PROVIDER === 'msg91') {
      required('MSG91_AUTH_KEY', 'MESSAGING_PROVIDER=msg91');
      if (env.SMS_ENABLED) required('MSG91_SMS_TEMPLATE_IDS', 'SMS_ENABLED=true with MSG91');
      if (env.WHATSAPP_ENABLED) {
        required('MSG91_WHATSAPP_NUMBER', 'WHATSAPP_ENABLED=true with MSG91');
        required('MSG91_WHATSAPP_TEMPLATES', 'WHATSAPP_ENABLED=true with MSG91');
      }
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
