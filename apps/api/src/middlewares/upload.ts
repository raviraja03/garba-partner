import type { RequestHandler } from 'express';
import multer from 'multer';
import { LIMITS, PROFILE_IMAGE_MIME_TYPES } from '@garba-partner/shared';
import { AppError } from '../lib/app-error.js';

const ACCEPTED_MIME_TYPES: readonly string[] = PROFILE_IMAGE_MIME_TYPES;

/**
 * Accepts exactly one image in the multipart field `fieldName`, kept in memory (never written to
 * disk). The declared type is only a first filter; `processProfileImage()` decodes and verifies.
 */
export function singleImageUpload(fieldName: string): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: LIMITS.PROFILE_IMAGE_MAX_BYTES, files: 1, fields: 0, parts: 1 },
    fileFilter: (_req, file, callback) => {
      if (ACCEPTED_MIME_TYPES.includes(file.mimetype)) {
        callback(null, true);
      } else {
        callback(
          new AppError('INVALID_IMAGE', { message: 'Please upload a JPEG, PNG or WebP image.' }),
        );
      }
    },
  }).single(fieldName);

  return (req, res, next) => {
    upload(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(
            new AppError('PAYLOAD_TOO_LARGE', {
              message: `Your photo must be ${String(LIMITS.PROFILE_IMAGE_MAX_BYTES / 1024 / 1024)} MB or smaller.`,
            }),
          );
          return;
        }
        next(
          new AppError('VALIDATION_ERROR', {
            message: `Send one image in the "${fieldName}" field.`,
          }),
        );
        return;
      }
      if (error) {
        next(error);
        return;
      }
      if (!req.file) {
        next(
          new AppError('VALIDATION_ERROR', {
            message: `Send one image in the "${fieldName}" field.`,
          }),
        );
        return;
      }
      next();
    });
  };
}
