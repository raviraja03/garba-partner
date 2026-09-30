import { Router, type RequestHandler } from 'express';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import { adminUserActionSchema, uuidParamSchema } from '@garba-partner/shared';
import { AppError } from '../../../lib/app-error.js';
import { ok } from '../../../lib/response.js';
import { parseInput } from '../../../lib/validation.js';
import { adminAuth } from '../../../middlewares/authenticate.js';
import { requirePermission } from '../../../middlewares/authorize.js';
import { AdminLoginChallenge, AdminSession, AdminUser } from '../../../models/index.js';
import { recordAdminAction } from '../audit/audit.service.js';

/**
 * Admin account management, mounted at `/api/v1/admin/admins` (`admins:manage`, super admins).
 * For now: resetting another admin's authenticator (lost phone). The admin enrols a new one at
 * their next sign-in; all their sessions end immediately.
 */
export function createAdminAdminsRouter(deps: {
  sequelize: Sequelize;
  env: ServerEnv;
  authenticateAdmin: RequestHandler;
}): Router {
  const router = Router();
  router.post(
    '/:adminId/reset-two-factor',
    deps.authenticateAdmin,
    requirePermission('admins:manage'),
    async (req, res) => {
      const actor = adminAuth(req);
      const adminId = parseInput(uuidParamSchema, req.params.adminId);
      const { reason } = parseInput(adminUserActionSchema, req.body);
      if (adminId === actor.adminId) {
        // Another super admin must do it: a stolen session can't swap the authenticator.
        throw new AppError('FORBIDDEN', {
          message: 'You cannot reset your own two-factor sign-in.',
        });
      }
      await deps.sequelize.transaction(async (transaction) => {
        const admin = await AdminUser.findByPk(adminId, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!admin) throw new AppError('NOT_FOUND', { message: 'Admin not found.' });
        await admin.update(
          { totpSecretEncrypted: null, totpEnabledAt: null, totpLastStep: null },
          { transaction },
        );
        const now = new Date();
        const [revoked] = await AdminSession.update(
          { revokedAt: now, revokedReason: 'two_factor_reset' },
          { where: { adminId, revokedAt: null }, transaction },
        );
        await AdminLoginChallenge.update(
          { consumedAt: now },
          { where: { adminId, consumedAt: null }, transaction },
        );
        await recordAdminAction(
          {
            adminId: actor.adminId,
            action: 'admin.two_factor_reset',
            targetType: 'admin',
            targetId: adminId,
            metadata: { reason, sessionsRevoked: revoked },
            ip: req.ip ?? 'unknown',
          },
          deps.env.OTP_HMAC_SECRET,
          transaction,
        );
      });
      res.setHeader('Cache-Control', 'no-store');
      ok(res, { adminId, twoFactorEnabled: false }, 'Two-factor sign-in reset');
    },
  );
  return router;
}
