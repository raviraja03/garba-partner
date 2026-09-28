import { Router, type RequestHandler } from 'express';
import { requireActiveMember, requireMemberStatus } from '../../middlewares/authorize.js';
import { singleImageUpload } from '../../middlewares/upload.js';
import type { ProfileController } from './profile.controller.js';

/** Own profile, mounted at `/api/v1/me`. */
export function createMyProfileRouter(deps: {
  controller: ProfileController;
  authenticateMember: RequestHandler;
  uploadLimiter: RequestHandler;
}): Router {
  const { controller, authenticateMember, uploadLimiter } = deps;
  const router = Router();

  // Suspended members may still read and fix their own profile; pending-deletion accounts may not.
  const canEdit = [authenticateMember, requireMemberStatus('active', 'suspended')];

  router.get('/profile', ...canEdit, controller.getMine);
  router.post('/profile', ...canEdit, controller.create);
  router.patch('/profile', ...canEdit, controller.update);
  router.get('/profile/preview', ...canEdit, controller.preview);
  router.post(
    '/profile/image',
    ...canEdit,
    uploadLimiter,
    singleImageUpload('image'),
    controller.uploadImage,
  );
  router.delete('/profile/image', ...canEdit, controller.deleteImage);
  router.put('/preferences', ...canEdit, controller.updatePreferences);

  return router;
}

/** Other members' public profiles, mounted at `/api/v1/users`. */
export function createPublicProfileRouter(deps: {
  controller: ProfileController;
  authenticateMember: RequestHandler;
}): Router {
  const router = Router();
  router.get(
    '/:userId/profile',
    deps.authenticateMember,
    requireActiveMember,
    deps.controller.getPublic,
  );
  return router;
}
