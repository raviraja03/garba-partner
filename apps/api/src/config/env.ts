import { fileURLToPath } from 'node:url';
import { loadServerEnv, type ServerEnv } from '@garba-partner/config/server';

/** Repository-root `.env`. The relative depth is the same from `src/config` and `dist/config`. */
const ROOT_ENV_FILE = fileURLToPath(new URL('../../../../.env', import.meta.url));

/** Reads and validates the API environment. Real environment variables override `.env`. */
export function readEnv(): ServerEnv {
  return loadServerEnv({ envFilePath: ROOT_ENV_FILE });
}
