import type { RequestHandler } from 'express';
import { roleHasPermission, type AdminPermission, type UserStatus } from '@garba-partner/shared';
import { AppError } from '../lib/app-error.js';

function statusError(status: UserStatus): AppError {
  switch (status) {
    case 'suspended':
      return new AppError('ACCOUNT_SUSPENDED');
    case 'pending_deletion':
      return new AppError('ACCOUNT_PENDING_DELETION');
    case 'banned':
    case 'active':
      return new AppError('ACCOUNT_BANNED');
  }
}

/**
 * Member routes that affect or expose other members (public profiles, discovery, interests,
 * chat, ...) require an ACTIVE account that has completed onboarding (a complete profile at least
 * once). Use after `authenticateMember`.
 */
export const requireActiveMember: RequestHandler = (req, _res, next) => {
  const auth = req.auth;
  if (!auth) throw new AppError('UNAUTHENTICATED');
  if (auth.status !== 'active') throw statusError(auth.status);
  if (!auth.onboarded) throw new AppError('ONBOARDING_REQUIRED');
  next();
};

/**
 * Allows only the listed account statuses (e.g. suspended members may still fix their own
 * profile, but pending-deletion accounts may not). Use after `authenticateMember`.
 */
export function requireMemberStatus(...allowed: UserStatus[]): RequestHandler {
  return (req, _res, next) => {
    const auth = req.auth;
    if (!auth) throw new AppError('UNAUTHENTICATED');
    if (!allowed.includes(auth.status)) throw statusError(auth.status);
    next();
  };
}

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
