import { LIMITS, PROFILE_IMAGE_MIME_TYPES } from '@garba-partner/shared';

export const PHOTO_ACCEPT: readonly string[] = PROFILE_IMAGE_MIME_TYPES;
export const PHOTO_MAX_MB = LIMITS.PROFILE_IMAGE_MAX_BYTES / 1024 / 1024;

/** Quick client-side checks; the server re-validates by decoding the file. */
export async function checkPhotoFile(file: File): Promise<string | null> {
  if (!PHOTO_ACCEPT.includes(file.type)) return 'Please choose a JPEG, PNG or WebP photo.';
  if (file.size > LIMITS.PROFILE_IMAGE_MAX_BYTES)
    return `Your photo must be ${String(PHOTO_MAX_MB)} MB or smaller.`;
  try {
    const bitmap = await createImageBitmap(file);
    const smallest = Math.min(bitmap.width, bitmap.height);
    bitmap.close();
    if (smallest < LIMITS.PROFILE_IMAGE_MIN_DIMENSION) {
      return `Your photo must be at least ${String(LIMITS.PROFILE_IMAGE_MIN_DIMENSION)}×${String(LIMITS.PROFILE_IMAGE_MIN_DIMENSION)} pixels.`;
    }
  } catch {
    return 'That file could not be read as an image.';
  }
  return null;
}
