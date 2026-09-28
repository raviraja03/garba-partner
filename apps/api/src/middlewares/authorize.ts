import type { RequestHandler } from 'express';
import { roleHasPermission, type AdminPermission } from '@garba-partner/shared';
import { AppError } from '../lib/app-error.js';

/**
 * Member routes that affect or expose other members (discovery, interests, chat, ...) require an
 * ACTIVE, onboarded account. Use after `authenticateMember`.
 */
export const requireActiveMember: RequestHandler = (req, _res, next) => {
  const auth = req.auth;
  if (!auth) throw new AppError('UNAUTHENTICATED');
  switch (auth.status) {
    case 'active':
      break;
    case 'suspended':
      throw new AppError('ACCOUNT_SUSPENDED');
    case 'pending_deletion':
      throw new AppError('ACCOUNT_PENDING_DELETION');
    case 'banned':
      throw new AppError('ACCOUNT_BANNED');
  }
  if (!auth.onboarded) {
    throw new AppError('FORBIDDEN', { message: 'Please complete your profile first.' });
  }
  next();
};

/**
 * Admin authorization by permission (never by role name in route code).
 * The role → permission matrix lives in @garba-partner/shared (ROLE_PERMISSIONS).
 * Use after `authenticateAdmin`.
 */
export function requirePermission(permission: AdminPermission): RequestHandler {
  return (req, _res, next) => {
    const admin = req.admin;
    if (!admin) throw new AppError('UNAUTHENTICATED');
    if (!roleHasPermission(admin.role, permission)) throw new AppError('FORBIDDEN');
    next();
  };
}
