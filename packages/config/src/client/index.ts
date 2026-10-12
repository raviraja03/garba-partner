// `zod/mini` is the tree-shakable Zod API; it keeps this browser entry small.
import * as z from 'zod/mini';

/**
 * Browser-safe environment schema for the Vite apps. Only `VITE_*` variables are exposed to
 * the client bundle, so nothing here may ever be a secret.
 *
 * `VITE_API_BASE_URL` is either a same-origin path (`/api/v1`, local development behind the
 * Vite proxy) or an absolute URL on the API domain (`https://api.example.in/api/v1`,
 * production: docs/deployment/production-setup.md).
 *
 * `VITE_FIREBASE_*` is the web configuration of the Firebase project used for phone sign-in
 * (docs/auth/firebase-phone-auth.md). These identify the project; they are public by design and
 * are not credentials. They are optional here so the rest of the site still loads without
 * them: sign-in then explains that it is not configured.
 */
export const clientEnvSchema = z.pipe(
  z.object({
    VITE_API_BASE_URL: z._default(
      z.string().check(z.regex(/^(\/|https?:\/\/[^/\s]+)/, 'Must be a path or an http(s) URL.')),
      '/api/v1',
    ),
    VITE_FIREBASE_API_KEY: z.optional(z.string()),
    VITE_FIREBASE_AUTH_DOMAIN: z.optional(z.string()),
    VITE_FIREBASE_PROJECT_ID: z.optional(z.string()),
    VITE_FIREBASE_APP_ID: z.optional(z.string()),
  }),
  z.transform((env) => {
    const apiBaseUrl = env.VITE_API_BASE_URL.replace(/\/+$/, '');
    return {
      apiBaseUrl,
      /** Origin of the API when it is on another host (Socket.IO connects there), else null. */
      apiOrigin: apiBaseUrl.startsWith('/') ? null : new URL(apiBaseUrl).origin,
      /** Firebase web config for phone sign-in, or null when it is not (fully) set. */
      firebase:
        env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_AUTH_DOMAIN && env.VITE_FIREBASE_PROJECT_ID
          ? {
              apiKey: env.VITE_FIREBASE_API_KEY,
              authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
              projectId: env.VITE_FIREBASE_PROJECT_ID,
              ...(env.VITE_FIREBASE_APP_ID ? { appId: env.VITE_FIREBASE_APP_ID } : {}),
            }
          : null,
    };
  }),
);

export type ClientEnv = z.output<typeof clientEnvSchema>;

/** Validates `import.meta.env`. Throws with variable names only (never values). */
export function loadClientEnv(source: Record<string, unknown>): ClientEnv {
  const result = clientEnvSchema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid client environment configuration: ${names}`);
  }
  return result.data;
}
