import type { Logger } from 'pino';
import { Op, type Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import { LIMITS, type MeDto, type MemberSessionDto } from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import {
  encryptString,
  hashPhone,
  hmacSha256Hex,
  randomToken,
  sha256Hex,
} from '../../lib/crypto.js';
import { User, UserProfile, UserSession } from '../../models/index.js';
import { PhoneTokenError, type PhoneTokenVerifier } from '../../providers/firebase/index.js';
import type { TokenService } from './token.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_AGENT_MAX = 255;

/** Request metadata recorded with sessions and rate limits (IP is only ever stored hashed). */
export interface ClientContext {
  ip: string;
  userAgent: string | undefined;
}

export interface IssuedMemberSession {
  session: MemberSessionDto;
  /** Raw refresh token: goes into the httpOnly cookie only, never into a response body. */
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface MemberAuthService {
  /**
   * Signs a member in (or up) with a Firebase ID token from phone verification. The phone
   * number is taken from the verified token, never from the caller.
   */
  loginWithPhoneToken(idToken: string, client: ClientContext): Promise<IssuedMemberSession>;
  refresh(refreshToken: string, client: ClientContext): Promise<IssuedMemberSession>;
  logout(userId: string, sessionId: string, allDevices: boolean): Promise<void>;
  getMe(userId: string): Promise<MeDto>;
}

export interface MemberAuthServiceDeps {
  sequelize: Sequelize;
  env: ServerEnv;
  /** Verifies Firebase Phone Authentication ID tokens. */
  phoneTokens: PhoneTokenVerifier;
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
  const { sequelize, env, phoneTokens, tokens, logger } = deps;

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
    async loginWithPhoneToken(idToken, client) {
      let phone: string;
      try {
        ({ phone } = await phoneTokens.verify(idToken));
      } catch (err) {
        const reason = err instanceof PhoneTokenError ? err.reason : 'malformed';
        // The reason only. Never the token: it is a credential until it expires.
        logger.warn({ reason }, 'Phone sign-in token rejected');
        if (reason === 'keys_unavailable') {
          throw new AppError('SERVICE_UNAVAILABLE', {
            message: 'We could not verify your number right now. Please try again.',
          });
        }
        if (reason === 'unsupported_number') {
          throw new AppError('PHONE_VERIFICATION_FAILED', {
            message: 'Only Indian mobile numbers are supported.',
          });
        }
        // One message for every other reason: a caller learns nothing about why.
        throw new AppError('PHONE_VERIFICATION_FAILED');
      }
      const phoneHash = hashPhone(phone, env.PHONE_HASH_SECRET);

      const outcome = await sequelize.transaction(async (transaction): Promise<VerifyOutcome> => {
        // Two sign-ins for the same new number at once must not both create the account.
        await sequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))', {
          replacements: { key: `phone-login:${phoneHash}` },
          transaction,
        });

        // Existing members are found by the same phone hash as before, so their ID, profile,
        // matches and history are untouched by the change of verification method.
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
