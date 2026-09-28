import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { API_PREFIX } from '@garba-partner/shared';
import { randomToken } from '../../lib/crypto.js';
import type { MediaStorage } from './media.storage.js';

/** URL path under which the API serves locally stored images (development only). */
export const LOCAL_MEDIA_ROUTE = `${API_PREFIX}/dev-media`;

const LOCAL_ID_PATTERN = /^local\/[A-Za-z0-9_-]+\.jpg$/;

/**
 * DEVELOPMENT ONLY: keeps processed images on disk and serves them from the API, so the upload
 * flow works without Cloudinary credentials. The env schema rejects MEDIA_STORAGE=local outside
 * APP_ENV=development. Images are served at their original (already downsized) size.
 */
export function createLocalStorage(directory: string): MediaStorage {
  return {
    name: 'local',

    async upload(image) {
      await mkdir(directory, { recursive: true });
      const fileName = `${randomToken(16)}.jpg`;
      await writeFile(join(directory, fileName), image.buffer);
      return { publicId: `local/${fileName}`, width: image.width, height: image.height };
    },

    async destroy(publicId) {
      if (!LOCAL_ID_PATTERN.test(publicId)) return;
      await rm(join(directory, publicId.slice('local/'.length)), { force: true });
    },

    url(publicId) {
      return `${LOCAL_MEDIA_ROUTE}/${publicId.slice('local/'.length)}`;
    },
  };
}
