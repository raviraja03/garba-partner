import type { ProcessedImage } from '../../lib/image.js';

export interface StoredMedia {
  publicId: string;
  width: number;
  height: number;
}

/** Storage folders (one per kind of image). */
export type MediaFolder = 'profile-images' | 'event-images';

/** Named renditions requested by the app (delivered resized by the storage provider). */
export type MediaVariant = 'card' | 'thumbnail' | 'event_card' | 'event_banner';

/**
 * Where processed images live. Implementations: Cloudinary (all real environments) and local disk
 * (development only). Only already-processed (EXIF-free) images are ever passed in.
 */
export interface MediaStorage {
  readonly name: string;
  upload(image: ProcessedImage, folder: MediaFolder): Promise<StoredMedia>;
  /** Idempotent: deleting a missing asset is not an error. */
  destroy(publicId: string): Promise<void>;
  url(publicId: string, variant: MediaVariant): string;
}

/** Profile photos crop around the face; event images (posters, venues) use automatic gravity. */
export const VARIANT_SIZES: Record<
  MediaVariant,
  { width: number; height: number; gravity: 'face' | 'auto' }
> = {
  card: { width: 600, height: 800, gravity: 'face' },
  thumbnail: { width: 160, height: 160, gravity: 'face' },
  event_card: { width: 800, height: 450, gravity: 'auto' },
  event_banner: { width: 1600, height: 900, gravity: 'auto' },
};
