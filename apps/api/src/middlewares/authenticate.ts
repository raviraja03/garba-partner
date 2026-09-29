import type { Request, RequestHandler } from 'express';
import { Op } from 'sequelize';
import type { AdminRole, UserStatus } from '@garba-partner/shared';
import { AppError } from '../lib/app-error.js';
import { AdminSession, AdminUser, User, UserSession } from '../models/index.js';
import type { TokenService } from '../modules/auth/token.service.js';

/** Set on `req.auth` by {@link createAuthenticateMember}. */
export interface MemberAuthContext {
  userId: string;
  sessionId: string;
  status: UserStatus;
  onboarded: boolean;
}

/** Set on `req.admin` by {@link createAuthenticateAdmin}. */
export interface AdminAuthContext {
  adminId: string;
  sessionId: string;
  role: AdminRole;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Member authentication: verifies the access token (member audience) and then checks the
 * session and account in the database on EVERY request, so logout, revocation and bans take
 * effect immediately rather than when the token expires.
 */
export function createAuthenticateMember(tokens: TokenService): RequestHandler {
  return async (req, _res, next) => {
    const token = bearerToken(req);
    const resolved = token ? await resolveMemberSession(tokens, token) : null;
    if (!resolved) throw new AppError('UNAUTHENTICATED');
    const { expiresAt: _expiresAt, ...auth } = resolved;
    req.auth = auth;
    next();
  };
}

/**
 * Verifies a member access token AND its session/account in the database. Shared by HTTP
 * requests and Socket.IO connections so both enforce exactly the same rules. Returns null for
 * any invalid token or revoked/expired session; throws ACCOUNT_BANNED for banned accounts.
 */
export async function resolveMemberSession(
  tokens: TokenService,
  token: string,
): Promise<(MemberAuthContext & { expiresAt: Date }) | null> {
  const claims = await tokens.verify('member', token);
  if (!claims) return null;

  const session = await UserSession.findOne({
    where: {
      id: claims.sessionId,
      userId: claims.subjectId,
      revokedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
    attributes: ['id'],
    include: [
      { model: User, required: true, attributes: ['id', 'status', 'onboardingCompletedAt'] },
    ],
  });
  const user = session?.user;
  if (!session || !user) return null;
  if (user.status === 'banned') throw new AppError('ACCOUNT_BANNED');

  return {
    userId: user.id,
    sessionId: session.id,
    status: user.status,
    onboarded: user.onboardingCompletedAt !== null,
    expiresAt: claims.expiresAt,
  };
}

/** True while a member session is still valid (re-checked on every socket event). */
export async function isMemberSessionActive(userId: string, sessionId: string): Promise<boolean> {
  const session = await UserSession.findOne({
    where: { id: sessionId, userId, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
    attributes: ['id'],
    include: [{ model: User, required: true, attributes: ['id'], where: { status: 'active' } }],
  });
  return session !== null;
}

/**
 * Admin authentication: admin audience + admin secret, admin session table, active admin only.
 * A member token can never pass this middleware (and vice versa).
 */
export function createAuthenticateAdmin(tokens: TokenService): RequestHandler {
  return async (req, _res, next) => {
    const token = bearerToken(req);
    const claims = token ? await tokens.verify('admin', token) : null;
    if (!claims) throw new AppError('UNAUTHENTICATED');

    const session = await AdminSession.findOne({
      where: {
        id: claims.sessionId,
        adminId: claims.subjectId,
        revokedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
      attributes: ['id'],
      include: [{ model: AdminUser, required: true, attributes: ['id', 'role', 'status'] }],
    });
    const admin = session?.admin;
    if (!session || admin?.status !== 'active') throw new AppError('UNAUTHENTICATED');

    req.admin = { adminId: admin.id, sessionId: session.id, role: admin.role };
    next();
  };
}

/** Returns the member context set by the authentication middleware (programming error if absent). */
export function memberAuth(req: Request): MemberAuthContext {
  if (!req.auth) throw new AppError('UNAUTHENTICATED');
  return req.auth;
}

export function adminAuth(req: Request): AdminAuthContext {
  if (!req.admin) throw new AppError('UNAUTHENTICATED');
  return req.admin;
}
