import { loadClientEnv } from '@garba-partner/config/client';

/** Validated client environment (public `VITE_*` values only). */
export const env = loadClientEnv(import.meta.env);
