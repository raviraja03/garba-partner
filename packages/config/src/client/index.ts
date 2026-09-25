// `zod/mini` is the tree-shakable Zod API; it keeps this browser entry small.
import * as z from 'zod/mini';

/**
 * Browser-safe environment schema for the Vite apps. Only `VITE_*` variables are exposed to
 * the client bundle, so nothing here may ever be a secret.
 */
export const clientEnvSchema = z.pipe(
  z.object({
    VITE_API_BASE_URL: z._default(z.string().check(z.minLength(1)), '/api/v1'),
  }),
  z.transform((env) => ({
    apiBaseUrl: env.VITE_API_BASE_URL.replace(/\/+$/, ''),
  })),
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
