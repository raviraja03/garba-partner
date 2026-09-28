import sharp, { type Metadata } from 'sharp';
import { LIMITS } from '@garba-partner/shared';
import { AppError } from './app-error.js';

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: 'jpeg';
  bytes: number;
}

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const OUTPUT_MAX_EDGE = 1600;
const MAX_INPUT_PIXELS = LIMITS.PROFILE_IMAGE_MAX_DIMENSION * LIMITS.PROFILE_IMAGE_MAX_DIMENSION;

/**
 * Validates an uploaded profile image by DECODING it (the file extension and Content-Type are
 * never trusted), then re-encodes it:
 * - rejects anything that is not a real JPEG/PNG/WebP, is too small, or is a decompression bomb;
 * - applies the EXIF orientation, then drops ALL metadata (EXIF incl. GPS location, XMP, ICC
 *   comments) — sharp strips metadata unless `keepMetadata()`/`withExif()` is called, which we
 *   never do;
 * - downsizes to at most 1600 px on the long edge and outputs JPEG.
 */
export async function processProfileImage(input: Buffer): Promise<ProcessedImage> {
  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' as const };

  let metadata: Metadata;
  try {
    metadata = await sharp(input, options).metadata();
  } catch {
    throw new AppError('INVALID_IMAGE', { message: 'That file is not a valid image.' });
  }

  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw new AppError('INVALID_IMAGE', { message: 'Please upload a JPEG, PNG or WebP image.' });
  }
  const width = metadata.autoOrient.width;
  const height = metadata.autoOrient.height;
  if (Math.min(width, height) < LIMITS.PROFILE_IMAGE_MIN_DIMENSION) {
    throw new AppError('INVALID_IMAGE', {
      message: `Your photo must be at least ${String(LIMITS.PROFILE_IMAGE_MIN_DIMENSION)}×${String(LIMITS.PROFILE_IMAGE_MIN_DIMENSION)} pixels.`,
    });
  }
  if (Math.max(width, height) > LIMITS.PROFILE_IMAGE_MAX_DIMENSION) {
    throw new AppError('INVALID_IMAGE', { message: 'That image is too large.' });
  }

  try {
    const { data, info } = await sharp(input, options)
      .rotate()
      .resize({
        width: OUTPUT_MAX_EDGE,
        height: OUTPUT_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: data,
      width: info.width,
      height: info.height,
      format: 'jpeg',
      bytes: info.size,
    };
  } catch {
    throw new AppError('INVALID_IMAGE', { message: 'That image could not be processed.' });
  }
}
