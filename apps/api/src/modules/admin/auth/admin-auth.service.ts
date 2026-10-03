import type { Logger } from 'pino';
import type { Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import {
  LIMITS,
  ROLE_PERMISSIONS,
  type AdminMeDto,
  type AdminSessionDto,
} from '@garba-partner/shared';
import { AppError } from '../../../lib/app-error.js';
import { hmacSha256Hex, randomToken, sha256Hex } from '../../../lib/crypto.js';
import { verifyAgainstDummy, verifyPassword } from '../../../lib/passwords.js';
import { AdminSession, AdminUser } from '../../../models/index.js';
import { recordAdminAction } from '../audit/audit.service.js';
import type { ClientContext } from '../../auth/auth.service.js';
import type { TokenService } from '../../auth/token.service.js';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export interface IssuedAdminSession {
  session: AdminSessionDto;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AdminAuthService {
  /** Email + password → session. */
  login(email: string, password: string, client: ClientContext): Promise<IssuedAdminSession>;
  refresh(refreshToken: string, client: ClientContext): Promise<IssuedAdminSession>;
  logout(adminId: string, sessionId: string, client: ClientContext): Promise<void>;
  getMe(adminId: string): Promise<AdminMeDto>;
}

export function toAdminMeDto(admin: AdminUser): AdminMeDto {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    permissions: ROLE_PERMISSIONS[admin.role],
  };
}

type LoginOutcome =
  | { kind: 'success'; admin: AdminUser; sessionId: string; refreshToken: string; expiresAt: Date }
  | { kind: 'rejected'; error: AppError };

type RefreshOutcome =
  | { kind: 'success'; admin: AdminUser; sessionId: string; refreshToken: string; expiresAt: Date }
  | { kind: 'invalid'; reason?: string };

export function createAdminAuthService(deps: {
  sequelize: Sequelize;
  env: ServerEnv;
  tokens: TokenService;
  logger: Logger;
}): AdminAuthService {
  const { sequelize, env, tokens, logger } = deps;

  const hashIp = (ip: string) => hmacSha256Hex(env.OTP_HMAC_SECRET, `ip:${ip}`);
  const truncateUserAgent = (userAgent: string | undefined) =>
    userAgent ? userAgent.slice(0, 255) : null;

  async function issue(
    admin: AdminUser,
    sessionId: string,
    refreshToken: string,
    expiresAt: Date,
  ): Promise<IssuedAdminSession> {
    const access = await tokens.sign('admin', { subjectId: admin.id, sessionId });
    return {
      session: {
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        admin: toAdminMeDto(admin),
      },
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }

  function audit(
    adminId: string,
    action: string,
    client: ClientContext,
    metadata: Record<string, unknown>,
    transaction: Transaction,
  ) {
    return recordAdminAction(
      { adminId, action, targetType: 'admin', targetId: adminId, metadata, ip: client.ip },
      env.OTP_HMAC_SECRET,
      transaction,
    );
  }

  /** A failed password. Five in a row lock the account for 15 minutes (audited). */
  async function registerFailure(
    admin: AdminUser,
    client: ClientContext,
    transaction: Transaction,
  ): Promise<boolean> {
    const failures = admin.failedLoginCount + 1;
    if (failures >= LIMITS.ADMIN_MAX_FAILED_LOGINS) {
      const lockedUntil = new Date(Date.now() + LIMITS.ADMIN_LOCKOUT_MINUTES * MINUTE_MS);
      await admin.update({ failedLoginCount: 0, lockedUntil }, { transaction });
      await audit(admin.id, 'admin.lockout', client, {}, transaction);
      logger.warn({ adminId: admin.id }, 'Admin account locked after failed sign-ins');
      return true;
    }
    await admin.update({ failedLoginCount: failures }, { transaction });
    return false;
  }

  return {
    async login(email, password, client) {
      const candidate = await AdminUser.scope('withPassword').findOne({ where: { email } });
      if (candidate?.status !== 'active') {
        // Same work and same error whether the account is unknown or disabled.
        await verifyAgainstDummy(password);
        throw new AppError('INVALID_CREDENTIALS');
      }

      // Verify outside the transaction: Argon2 is deliberately slow.
      const passwordOk = await verifyPassword(candidate.passwordHash, password);

      const outcome = await sequelize.transaction(async (transaction): Promise<LoginOutcome> => {
        const now = new Date();
        const admin = await AdminUser.findByPk(candidate.id, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (admin?.status !== 'active') {
          return { kind: 'rejected', error: new AppError('INVALID_CREDENTIALS') };
        }

        if (admin.lockedUntil && admin.lockedUntil.getTime() > now.getTime()) {
          return {
            kind: 'rejected',
            error: new AppError('ACCOUNT_LOCKED', {
              retryAfterSeconds: (admin.lockedUntil.getTime() - now.getTime()) / 1000,
            }),
          };
        }

        if (!passwordOk) {
          const locked = await registerFailure(admin, client, transaction);
          return {
            kind: 'rejected',
            error: locked
              ? new AppError('ACCOUNT_LOCKED', {
                  retryAfterSeconds: LIMITS.ADMIN_LOCKOUT_MINUTES * 60,
                })
              : new AppError('INVALID_CREDENTIALS'),
          };
        }

        await admin.update(
          { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
          { transaction },
        );
        const refreshToken = randomToken();
        const expiresAt = new Date(now.getTime() + env.ADMIN_SESSION_TTL_HOURS * HOUR_MS);
        const session = await AdminSession.create(
          {
            adminId: admin.id,
            refreshTokenHash: sha256Hex(refreshToken),
            userAgent: truncateUserAgent(client.userAgent),
            ipHash: hashIp(client.ip),
            expiresAt,
          },
          { transaction },
        );
        await audit(admin.id, 'admin.login', client, { sessionId: session.id }, transaction);
        return { kind: 'success', admin, sessionId: session.id, refreshToken, expiresAt };
      });

      if (outcome.kind === 'rejected') throw outcome.error;
      logger.info({ adminId: outcome.admin.id }, 'Admin logged in');
      return issue(outcome.admin, outcome.sessionId, outcome.refreshToken, outcome.expiresAt);
    },

    async refresh(refreshToken, client) {
      const tokenHash = sha256Hex(refreshToken);

      const outcome = await sequelize.transaction(async (transaction): Promise<RefreshOutcome> => {
        const now = new Date();
        const session = await AdminSession.findOne({
          where: { refreshTokenHash: tokenHash },
          lock: transaction.LOCK.UPDATE,
          transaction,
        });

        if (!session) {
          const reused = await AdminSession.findOne({
            where: { previousRefreshTokenHash: tokenHash, revokedAt: null },
            lock: transaction.LOCK.UPDATE,
            transaction,
          });
          const sinceRotation = now.getTime() - (reused?.rotatedAt?.getTime() ?? 0);
          if (reused && sinceRotation > LIMITS.REFRESH_REUSE_GRACE_SECONDS * 1000) {
            await reused.update(
              { revokedAt: now, revokedReason: 'reuse_detected' },
              { transaction },
            );
            return { kind: 'invalid', reason: 'reuse_detected' };
          }
          return { kind: 'invalid' };
        }

        if (session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
          return { kind: 'invalid' };
        }
        if (
          now.getTime() - session.lastUsedAt.getTime() >
          env.ADMIN_SESSION_IDLE_MINUTES * MINUTE_MS
        ) {
          await session.update({ revokedAt: now, revokedReason: 'idle_timeout' }, { transaction });
          return { kind: 'invalid', reason: 'idle_timeout' };
        }
        const admin = await AdminUser.findByPk(session.adminId, { transaction });
        if (admin?.status !== 'active') {
          await session.update({ revokedAt: now, revokedReason: 'disabled' }, { transaction });
          return { kind: 'invalid', reason: 'disabled' };
        }

        const nextToken = randomToken();
        await session.update(
          {
            refreshTokenHash: sha256Hex(nextToken),
            previousRefreshTokenHash: tokenHash,
            rotatedAt: now,
            lastUsedAt: now,
            userAgent: truncateUserAgent(client.userAgent),
            ipHash: hashIp(client.ip),
          },
          { transaction },
        );
        return {
          kind: 'success',
          admin,
          sessionId: session.id,
          refreshToken: nextToken,
          expiresAt: session.expiresAt,
        };
      });

      if (outcome.kind !== 'success') {
        if (outcome.reason)
          logger.warn({ reason: outcome.reason }, 'Admin session refresh rejected');
        throw new AppError('REFRESH_INVALID');
      }
      return issue(outcome.admin, outcome.sessionId, outcome.refreshToken, outcome.expiresAt);
    },

    async logout(adminId, sessionId, client) {
      await sequelize.transaction(async (transaction) => {
        const [revoked] = await AdminSession.update(
          { revokedAt: new Date(), revokedReason: 'logout' },
          { where: { id: sessionId, adminId, revokedAt: null }, transaction },
        );
        if (revoked > 0) await audit(adminId, 'admin.logout', client, { sessionId }, transaction);
      });
    },

    async getMe(adminId) {
      const admin = await AdminUser.findByPk(adminId);
      if (admin?.status !== 'active') throw new AppError('UNAUTHENTICATED');
      return toAdminMeDto(admin);
    },
  };
}
