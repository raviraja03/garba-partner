import type { Logger } from 'pino';
import { Op, type Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import {
  LIMITS,
  type MeDto,
  type MemberSessionDto,
  type SendOtpResultDto,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import {
  encryptString,
  hashPhone,
  hmacSha256Hex,
  randomToken,
  sha256Hex,
} from '../../lib/crypto.js';
import { User, UserProfile, UserSession } from '../../models/index.js';
import type { SmsProvider } from '../../providers/sms/index.js';
import { logOtp } from './otp-log.js';
import { createOtpService } from './otp.service.js';
import type { TokenService } from './token.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_AGENT_MAX = 255;

/** Request metadata recorded with sessions and rate limits (IP is only ever stored hashed). */
export interface ClientContext {
  ip: string;
  userAgent: string | undefined;
  /** For log lines that belong to this request (see `logOtp`). */
  requestId?: string | undefined;
}

export interface IssuedMemberSession {
  session: MemberSessionDto;
  /** Raw refresh token: goes into the httpOnly cookie only, never into a response body. */
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface MemberAuthService {
  sendOtp(phone: string, client: ClientContext): Promise<SendOtpResultDto>;
  verifyOtp(phone: string, code: string, client: ClientContext): Promise<IssuedMemberSession>;
  refresh(refreshToken: string, client: ClientContext): Promise<IssuedMemberSession>;
  logout(userId: string, sessionId: string, allDevices: boolean): Promise<void>;
  getMe(userId: string): Promise<MeDto>;
}

export interface MemberAuthServiceDeps {
  sequelize: Sequelize;
  env: ServerEnv;
  sms: SmsProvider;
  tokens: TokenService;
  logger: Logger;
}

type VerifyOutcome =
  | { kind: 'success'; user: User; sessionId: string; refreshToken: string; expiresAt: Date }
  | { kind: 'rejected'; error: AppError };

type RefreshOutcome =
  | { kind: 'success'; user: User; sessionId: string; refreshToken: string; expiresAt: Date }
  | { kind: 'invalid' }
  | { kind: 'reuse_detected'; sessionId: string };

export function toMeDto(user: User): MeDto {
  return {
    id: user.id,
    status: user.status,
    onboardingStatus: user.onboardingCompletedAt ? 'complete' : 'incomplete',
    photoVerified: user.photoVerifiedAt !== null,
    displayName: user.profile?.displayName ?? null,
  };
}

export function createMemberAuthService(deps: MemberAuthServiceDeps): MemberAuthService {
  const { sequelize, env, sms, tokens, logger } = deps;
  const otp = createOtpService({ sequelize, env });

  const hashIp = (ip: string) => hmacSha256Hex(env.OTP_HMAC_SECRET, `ip:${ip}`);
  const truncateUserAgent = (userAgent: string | undefined) =>
    userAgent ? userAgent.slice(0, USER_AGENT_MAX) : null;

  function loadUser(userId: string, transaction?: Transaction): Promise<User | null> {
    return User.findByPk(userId, {
      include: [{ model: UserProfile, attributes: ['displayName'] }],
      ...(transaction ? { transaction } : {}),
    });
  }

  async function createSession(userId: string, client: ClientContext, transaction: Transaction) {
    const refreshToken = randomToken();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    const session = await UserSession.create(
      {
        userId,
        refreshTokenHash: sha256Hex(refreshToken),
        userAgent: truncateUserAgent(client.userAgent),
        ipHash: hashIp(client.ip),
        expiresAt,
      },
      { transaction },
    );
    return { sessionId: session.id, refreshToken, expiresAt };
  }

  async function issue(
    user: User,
    sessionId: string,
    refreshToken: string,
    expiresAt: Date,
  ): Promise<IssuedMemberSession> {
    const access = await tokens.sign('member', { subjectId: user.id, sessionId });
    return {
      session: {
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        user: toMeDto(user),
      },
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }

  return {
    async sendOtp(phone, client) {
      const phoneHash = hashPhone(phone, env.PHONE_HASH_SECRET);

      const { code, deliver } = await sequelize.transaction(async (transaction) => {
        const issuedCode = await otp.issue(phoneHash, hashIp(client.ip), transaction);
        const existing = await User.findOne({
          where: { phoneHash },
          attributes: ['id', 'status'],
          transaction,
        });
        // Banned numbers get the same response but no SMS (no cost, no signal).
        return { code: issuedCode, deliver: existing?.status !== 'banned' };
      });

      if (deliver) {
        if (env.LOG_OTP) {
          logOtp(logger, {
            purpose: 'LOGIN',
            phone,
            code,
            expiresAt: new Date(Date.now() + LIMITS.OTP_TTL_SECONDS * 1000),
            requestId: client.requestId,
          });
        }
        try {
          await sms.sendOtp(phone, code);
        } catch (err) {
          logger.error({ err, provider: sms.name }, 'OTP delivery failed');
          throw new AppError('SERVICE_UNAVAILABLE', {
            message: 'We could not send the code. Please try again.',
          });
        }
      }

      return {
        expiresInSeconds: LIMITS.OTP_TTL_SECONDS,
        resendAvailableInSeconds: LIMITS.OTP_RESEND_COOLDOWN_SECONDS,
        // Double guard: the env schema already forbids the dev provider outside development.
        ...(sms.exposesCodeInResponse && env.APP_ENV === 'development' ? { devOtp: code } : {}),
      };
    },

    async verifyOtp(phone, code, client) {
      const phoneHash = hashPhone(phone, env.PHONE_HASH_SECRET);

      // Failed attempts must be persisted, so the transaction returns an outcome and errors are
      // thrown only after it commits.
      const outcome = await sequelize.transaction(async (transaction): Promise<VerifyOutcome> => {
        const result = await otp.check(phoneHash, code, transaction);
        switch (result.kind) {
          case 'no_active_code':
            return {
              kind: 'rejected',
              error: new AppError('OTP_INVALID', {
                message: 'There is no active code for this number. Please request a new one.',
              }),
            };
          case 'expired':
            return { kind: 'rejected', error: new AppError('OTP_EXPIRED') };
          case 'attempts_exceeded':
            return { kind: 'rejected', error: new AppError('OTP_ATTEMPTS_EXCEEDED') };
          case 'invalid':
            return {
              kind: 'rejected',
              error: new AppError('OTP_INVALID', {
                message: `That code is not correct. ${String(result.attemptsRemaining)} attempt(s) left.`,
              }),
            };
          case 'valid':
            break;
        }

        let user = await User.findOne({ where: { phoneHash }, transaction });
        user ??= await User.create(
          {
            phoneHash,
            phoneEncrypted: encryptString(phone, env.PHONE_ENCRYPTION_KEY),
            phoneKeyVersion: env.PHONE_ENCRYPTION_KEY_VERSION,
          },
          { transaction },
        );

        if (user.status === 'banned') {
          return { kind: 'rejected', error: new AppError('ACCOUNT_BANNED') };
        }

        await user.update({ lastActiveAt: new Date() }, { transaction });
        const session = await createSession(user.id, client, transaction);
        const loaded = (await loadUser(user.id, transaction)) ?? user;
        return { kind: 'success', user: loaded, ...session };
      });

      if (outcome.kind === 'rejected') throw outcome.error;
      return issue(outcome.user, outcome.sessionId, outcome.refreshToken, outcome.expiresAt);
    },

    async refresh(refreshToken, client) {
      const tokenHash = sha256Hex(refreshToken);

      const outcome = await sequelize.transaction(async (transaction): Promise<RefreshOutcome> => {
        const now = new Date();
        const session = await UserSession.findOne({
          where: { refreshTokenHash: tokenHash },
          lock: transaction.LOCK.UPDATE,
          transaction,
        });

        if (session) {
          if (session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
            return { kind: 'invalid' };
          }
          const user = await loadUser(session.userId, transaction);
          if (!user || user.status === 'banned') {
            await session.update({ revokedAt: now, revokedReason: 'sanction' }, { transaction });
            return { kind: 'invalid' };
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
          // Activity for the admin dashboard ("active users"): at most one write per hour.
          await User.update(
            { lastActiveAt: now },
            {
              where: {
                id: user.id,
                [Op.or]: [
                  { lastActiveAt: null },
                  { lastActiveAt: { [Op.lt]: new Date(now.getTime() - 60 * 60 * 1000) } },
                ],
              },
              transaction,
            },
          );
          return {
            kind: 'success',
            user,
            sessionId: session.id,
            refreshToken: nextToken,
            expiresAt: session.expiresAt,
          };
        }

        // A rotated-out token is being presented again.
        const reused = await UserSession.findOne({
          where: { previousRefreshTokenHash: tokenHash, revokedAt: null },
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!reused) return { kind: 'invalid' };

        const sinceRotation = now.getTime() - (reused.rotatedAt?.getTime() ?? 0);
        if (sinceRotation <= LIMITS.REFRESH_REUSE_GRACE_SECONDS * 1000) {
          // Benign race (two tabs refreshing at once): reject without revoking.
          return { kind: 'invalid' };
        }
        await reused.update({ revokedAt: now, revokedReason: 'reuse_detected' }, { transaction });
        return { kind: 'reuse_detected', sessionId: reused.id };
      });

      if (outcome.kind === 'reuse_detected') {
        logger.warn(
          { sessionId: outcome.sessionId },
          'Refresh token reuse detected; session revoked',
        );
      }
      if (outcome.kind !== 'success') throw new AppError('REFRESH_INVALID');
      return issue(outcome.user, outcome.sessionId, outcome.refreshToken, outcome.expiresAt);
    },

    async logout(userId, sessionId, allDevices) {
      const now = new Date();
      await sequelize.transaction(async (transaction) => {
        await UserSession.update(
          { revokedAt: now, revokedReason: allDevices ? 'logout_all' : 'logout' },
          {
            where: allDevices
              ? { userId, revokedAt: null }
              : { id: sessionId, userId, revokedAt: null },
            transaction,
          },
        );
      });
    },

    async getMe(userId) {
      const user = await loadUser(userId);
      if (!user) throw new AppError('UNAUTHENTICATED');
      return toMeDto(user);
    },
  };
}
