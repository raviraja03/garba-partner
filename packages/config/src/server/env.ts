import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export const APP_ENVS = ['development', 'staging', 'production'] as const;
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];
export type AppEnv = (typeof APP_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Normalises an origin such as `https://example.com/` to `https://example.com`. */
const originSchema = z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin);

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
  })
  .superRefine((env, ctx) => {
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

  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid server environment configuration:\n${details}`);
  }
  return result.data;
}
