import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { randomToken } from '../../lib/crypto.js';
import { VARIANT_SIZES, type MediaStorage } from './media.storage.js';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** e.g. `garba-partner/production` */
  folderPrefix: string;
}

/**
 * Cloudinary storage (docs/users/cloudinary.md). Uploads are signed server-side with the API
 * secret — the browser never talks to Cloudinary's upload API. Public IDs are random, so they
 * reveal nothing about the member.
 */
export function createCloudinaryStorage(config: CloudinaryConfig): MediaStorage {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  return {
    name: 'cloudinary',

    upload(image, folder) {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `${config.folderPrefix}/${folder}`,
            public_id: randomToken(16),
            resource_type: 'image',
            type: 'upload',
            overwrite: false,
            unique_filename: false,
            use_filename: false,
          },
          (error, result?: UploadApiResponse) => {
            if (error || !result) {
              reject(new Error('Cloudinary upload failed', { cause: error }));
              return;
            }
            resolve({ publicId: result.public_id, width: result.width, height: result.height });
          },
        );
        stream.end(image.buffer);
      });
    },

    async destroy(publicId) {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    },

    url(publicId, variant) {
      const size = VARIANT_SIZES[variant];
      return cloudinary.url(publicId, {
        secure: true,
        transformation: [
          { width: size.width, height: size.height, crop: 'fill', gravity: size.gravity },
          { fetch_format: 'auto', quality: 'auto' },
        ],
      });
    },
  };
}
