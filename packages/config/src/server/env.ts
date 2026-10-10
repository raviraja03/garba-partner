import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export const APP_ENVS = ['development', 'staging', 'production'] as const;
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
/**
 * Who delivers login codes. `dev` sends nothing and returns the code in the send-otp response;
 * it is only accepted when APP_ENV=development. `meta_whatsapp` sends the code as a WhatsApp
 * message through the Meta WhatsApp Cloud API (docs/notifications/meta-whatsapp.md).
 */
export const OTP_PROVIDERS = ['dev', 'meta_whatsapp'] as const;
/**
 * Who delivers notifications outside the app. `log` writes them to the server log instead of
 * sending (development only). `meta` sends WhatsApp messages through the Meta Cloud API.
 */
export const MESSAGING_PROVIDERS = ['log', 'meta'] as const;
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
export type OtpProviderKind = (typeof OTP_PROVIDERS)[number];
export type MessagingProviderKind = (typeof MESSAGING_PROVIDERS)[number];
export type MediaStorageKind = (typeof MEDIA_STORAGES)[number];
export type IdentityProviderKind = (typeof IDENTITY_PROVIDERS)[number];
export type PaymentProviderKind = (typeof PAYMENT_PROVIDERS)[number];

/** Normalises an origin such as `https://example.com/` to `https://example.com`. */
const originSchema = z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin);

const postgresUrlSchema = z.url({ protocol: /^postgres(ql)?$/ });

/** At least 32 characters of secret material (e.g. 32 random bytes, base64-encoded). */
const secretSchema = z.string().min(32, 'must be at least 32 characters');

/** `type:template,type:template` (which WhatsApp template to use for each notification type). */
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
     * Prints each one-time code to the server log (`[OTP]` line, phone masked). Local debugging
     * only: refused unless APP_ENV=development, because anyone who can read the log could sign in
     * as that member.
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
    OTP_PROVIDER: z.enum(OTP_PROVIDERS).default('dev'),
    /** Renamed to OTP_PROVIDER. Still read only to say so clearly at start-up. */
    SMS_PROVIDER: z.string().optional(),

    /**
     * Send member notifications outside the app as well
     * (docs/notifications/notification-channels.md). WhatsApp goes through Meta
     * (MESSAGING_PROVIDER=meta). There is no SMS provider: SMS_ENABLED only works with the
     * development `log` provider.
     */
    SMS_ENABLED: z.stringbool().default(false),
    WHATSAPP_ENABLED: z.stringbool().default(false),
    MESSAGING_PROVIDER: z.enum(MESSAGING_PROVIDERS).default('log'),

    /**
     * Meta WhatsApp Cloud API (docs/notifications/meta-whatsapp.md). All server-only; the access
     * token and the app secret are secrets and must never reach the web apps.
     */
    /** System-user access token with the whatsapp_business_messaging permission. */
    META_WHATSAPP_ACCESS_TOKEN: z.string().min(20).optional(),
    /** The ID Meta gives the sending number (not the phone number itself). */
    META_WHATSAPP_PHONE_NUMBER_ID: z
      .string()
      .regex(/^\d{5,25}$/, 'digits only (the Phone Number ID from the Meta dashboard)')
      .optional(),
    /** App secret of the Meta app: verifies that webhook calls really come from Meta. */
    META_WHATSAPP_APP_SECRET: z.string().min(16).optional(),
    /** Any long random string you choose; entered again when registering the webhook in Meta. */
    META_WHATSAPP_VERIFY_TOKEN: z.string().min(16).optional(),
    /** Graph API version used for every call. */
    META_WHATSAPP_API_VERSION: z
      .string()
      .regex(/^v\d{1,3}\.\d{1,2}$/, 'e.g. v25.0')
      .default('v25.0'),
    /** Language code of the approved templates, exactly as shown in WhatsApp Manager. */
    META_WHATSAPP_TEMPLATE_LANGUAGE: z
      .string()
      .regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'e.g. en or en_US')
      .default('en'),
    /** Name of the approved "Authentication" template that carries the login code. */
    META_WHATSAPP_OTP_TEMPLATE: z
      .string()
      .regex(/^[a-z0-9_]{1,512}$/, 'lowercase letters, digits and underscores (a template name)')
      .optional(),
    /** Approved "Utility" template name per notification type. */
    META_WHATSAPP_TEMPLATES: templateMapSchema.optional(),

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
    if (env.SMS_PROVIDER !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: 'was renamed: use OTP_PROVIDER (dev | meta_whatsapp) and remove this line',
      });
    }
    // The dev OTP mechanism returns codes in API responses: never outside local development.
    if (env.OTP_PROVIDER === 'dev' && env.APP_ENV !== 'development') {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_PROVIDER'],
        message: '"dev" is only allowed when APP_ENV=development; use "meta_whatsapp"',
      });
    }
    // Codes in a log file let anyone who can read it sign in as a member.
    if (env.LOG_OTP && env.APP_ENV !== 'development') {
      ctx.addIssue({
        code: 'custom',
        path: ['LOG_OTP'],
        message: 'is only allowed when APP_ENV=development',
      });
    }

    // The log provider writes to the log instead of sending: recording those as "sent" outside
    // local development would be false.
    if (env.WHATSAPP_ENABLED && env.MESSAGING_PROVIDER === 'log' && env.APP_ENV !== 'development') {
      ctx.addIssue({
        code: 'custom',
        path: ['WHATSAPP_ENABLED'],
        message: 'needs MESSAGING_PROVIDER=meta outside development ("log" does not send anything)',
      });
    }
    if (env.SMS_ENABLED && env.APP_ENV !== 'development') {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_ENABLED'],
        message: 'is only allowed when APP_ENV=development: there is no SMS provider',
      });
    }
    const required = (key: keyof typeof env, when: string): void => {
      if (env[key] === undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: `is required when ${when}` });
      }
    };
    const metaForOtp = env.OTP_PROVIDER === 'meta_whatsapp';
    const metaForNotifications = env.MESSAGING_PROVIDER === 'meta' && env.WHATSAPP_ENABLED;
    if (metaForOtp) required('META_WHATSAPP_OTP_TEMPLATE', 'OTP_PROVIDER=meta_whatsapp');
    if (metaForNotifications) {
      required('META_WHATSAPP_TEMPLATES', 'WHATSAPP_ENABLED=true with MESSAGING_PROVIDER=meta');
    }
    if (metaForOtp || metaForNotifications) {
      const when = 'Meta WhatsApp is used';
      required('META_WHATSAPP_ACCESS_TOKEN', when);
      required('META_WHATSAPP_PHONE_NUMBER_ID', when);
      // Delivery results only arrive through the signed webhook.
      required('META_WHATSAPP_APP_SECRET', when);
      required('META_WHATSAPP_VERIFY_TOKEN', when);
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
