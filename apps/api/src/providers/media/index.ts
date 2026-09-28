import { fileURLToPath } from 'node:url';
import type { ServerEnv } from '@garba-partner/config/server';
import { createCloudinaryStorage } from './cloudinary.storage.js';
import { createLocalStorage } from './local.storage.js';
import type { MediaStorage } from './media.storage.js';

export type { MediaStorage, MediaVariant, StoredMedia } from './media.storage.js';
export { LOCAL_MEDIA_ROUTE } from './local.storage.js';

/** `apps/api/.local-media` (git-ignored). Same depth from `src/providers/media` and `dist/…`. */
export const LOCAL_MEDIA_DIRECTORY = fileURLToPath(
  new URL('../../../.local-media', import.meta.url),
);

export function createMediaStorage(env: ServerEnv): MediaStorage {
  switch (env.MEDIA_STORAGE) {
    case 'local':
      return createLocalStorage(LOCAL_MEDIA_DIRECTORY);
    case 'cloudinary': {
      const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
      // The env schema guarantees these are set when MEDIA_STORAGE=cloudinary.
      if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
        throw new Error('Cloudinary credentials are missing');
      }
      return createCloudinaryStorage({
        cloudName: CLOUDINARY_CLOUD_NAME,
        apiKey: CLOUDINARY_API_KEY,
        apiSecret: CLOUDINARY_API_SECRET,
        folderPrefix: `${env.CLOUDINARY_FOLDER_PREFIX}/${env.APP_ENV}`,
      });
    }
  }
}
