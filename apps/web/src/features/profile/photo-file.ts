import { LIMITS, PROFILE_IMAGE_MIME_TYPES } from '@garba-partner/shared';

export const PHOTO_ACCEPT: readonly string[] = PROFILE_IMAGE_MIME_TYPES;
export const PHOTO_MAX_MB = LIMITS.PROFILE_IMAGE_MAX_BYTES / 1024 / 1024;

/**
 * Photos are shrunk in the browser before upload. The server stores at most 1600 px on the
 * long edge anyway (`apps/api/src/lib/image.ts`), so nothing visible is lost, and a phone
 * photo (often 5–15 MB, 12–48 megapixels) becomes a few hundred KB: the upload is fast and
 * reliable on mobile data and never hits a size limit on the way.
 */
const UPLOAD_MAX_EDGE = 2048;
/** Below this, a photo of an accepted type and size is uploaded unchanged. */
const UPLOAD_KEEP_BYTES = 1.5 * 1024 * 1024;
const UPLOAD_JPEG_QUALITY = 0.88;

export type PreparedPhoto = { file: File; error?: undefined } | { file?: undefined; error: string };

function toJpeg(bitmap: ImageBitmap, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY);
  });
}

/**
 * Checks a chosen photo and returns the file to upload: the original when it is already small,
 * otherwise a downsized JPEG. The server still validates everything by decoding the file.
 *
 * iPhones: Safari hands over JPEG (it converts HEIC because HEIC is not in `accept`), but large
 * ones. Shrinking them here is what makes the upload work on a slow or mobile connection.
 */
export async function preparePhotoFile(file: File): Promise<PreparedPhoto> {
  let bitmap: ImageBitmap;
  try {
    // Applies the EXIF rotation, so the photo is upright after re-encoding.
    bitmap = await createImageBitmap(file);
  } catch {
    return {
      error: PHOTO_ACCEPT.includes(file.type)
        ? 'That file could not be read as an image.'
        : 'Please choose a JPEG, PNG or WebP photo.',
    };
  }
  try {
    const { width, height } = bitmap;
    if (Math.min(width, height) < LIMITS.PROFILE_IMAGE_MIN_DIMENSION) {
      return {
        error: `Your photo must be at least ${String(LIMITS.PROFILE_IMAGE_MIN_DIMENSION)}×${String(LIMITS.PROFILE_IMAGE_MIN_DIMENSION)} pixels.`,
      };
    }
    const longEdge = Math.max(width, height);
    if (
      PHOTO_ACCEPT.includes(file.type) &&
      file.size <= UPLOAD_KEEP_BYTES &&
      longEdge <= UPLOAD_MAX_EDGE
    ) {
      return { file };
    }

    const scale = Math.min(1, UPLOAD_MAX_EDGE / longEdge);
    const blob = await toJpeg(bitmap, Math.round(width * scale), Math.round(height * scale));
    if (blob && blob.size <= LIMITS.PROFILE_IMAGE_MAX_BYTES) {
      const name = `${file.name.replace(/\.[^.]*$/, '') || 'photo'}.jpg`;
      return { file: new File([blob], name, { type: 'image/jpeg' }) };
    }
    // Shrinking failed (very old browser): send the original if it is allowed as it is.
    if (PHOTO_ACCEPT.includes(file.type) && file.size <= LIMITS.PROFILE_IMAGE_MAX_BYTES) {
      return { file };
    }
    return { error: `Your photo must be ${String(PHOTO_MAX_MB)} MB or smaller.` };
  } finally {
    bitmap.close();
  }
}
