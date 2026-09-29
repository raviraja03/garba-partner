import type { RequestHandler } from 'express';
import {
  createProfileSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  uuidParamSchema,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { ok } from '../../lib/response.js';
import { parseInput } from '../../lib/validation.js';
import { memberAuth } from '../../middlewares/authenticate.js';
import type { ProfileService } from './profile.service.js';

export interface ProfileController {
  getMine: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  preview: RequestHandler;
  updatePreferences: RequestHandler;
  uploadImage: RequestHandler;
  deleteImage: RequestHandler;
  getPublic: RequestHandler;
}

export function createProfileController(service: ProfileService): ProfileController {
  return {
    async getMine(req, res) {
      res.setHeader('Cache-Control', 'no-store');
      ok(res, await service.getMyProfile(memberAuth(req).userId));
    },

    async create(req, res) {
      const input = parseInput(createProfileSchema, req.body);
      ok(res, await service.createProfile(memberAuth(req).userId, input), 'Profile created', 201);
    },

    async update(req, res) {
      const input = parseInput(updateProfileSchema, req.body);
      ok(res, await service.updateProfile(memberAuth(req).userId, input), 'Profile updated');
    },

    async preview(req, res) {
      res.setHeader('Cache-Control', 'no-store');
      ok(res, await service.getPreview(memberAuth(req).userId));
    },

    async updatePreferences(req, res) {
      const input = parseInput(updatePreferencesSchema, req.body);
      ok(
        res,
        await service.updatePreferences(memberAuth(req).userId, input),
        'Preferences updated',
      );
    },

    async uploadImage(req, res) {
      if (!req.file) throw new AppError('VALIDATION_ERROR', { message: 'No image received.' });
      ok(res, await service.uploadImage(memberAuth(req).userId, req.file.buffer), 'Photo updated');
    },

    async deleteImage(req, res) {
      ok(res, await service.deleteImage(memberAuth(req).userId), 'Photo removed');
    },

    async getPublic(req, res) {
      const userId = parseInput(uuidParamSchema, req.params.userId);
      res.setHeader('Cache-Control', 'private, no-store');
      ok(res, await service.getPublicProfile(memberAuth(req).userId, userId));
    },
  };
}
