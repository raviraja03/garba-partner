import type { ProcessedImage } from '../../lib/image.js';

export interface StoredMedia {
  publicId: string;
  width: number;
  height: number;
}

/** Named renditions requested by the app (delivered resized by the storage provider). */
export type MediaVariant = 'card' | 'thumbnail';

/**
 * Where processed images live. Implementations: Cloudinary (all real environments) and local disk
 * (development only). Only already-processed (EXIF-free) images are ever passed in.
 */
export interface MediaStorage {
  readonly name: string;
  upload(image: ProcessedImage, folder: 'profile-images'): Promise<StoredMedia>;
  /** Idempotent: deleting a missing asset is not an error. */
  destroy(publicId: string): Promise<void>;
  url(publicId: string, variant: MediaVariant): string;
}

export const VARIANT_SIZES: Record<MediaVariant, { width: number; height: number }> = {
  card: { width: 600, height: 800 },
  thumbnail: { width: 160, height: 160 },
};
