import { Op, type WhereOptions } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import {
  LIMITS,
  normalizeIndianMobile,
  todayInIndia,
  type AdminConnectionSummaryDto,
  type AdminUserDetailDto,
  type AdminUserListItemDto,
  type AdminUserListQueryData,
  type PaginationMeta,
} from '@garba-partner/shared';
import { AppError } from '../../../lib/app-error.js';
import { hashPhone } from '../../../lib/crypto.js';
import { decodeCursor, encodeCursor } from '../../../lib/pagination.js';
import { escapeLike } from '../../../lib/sql.js';
import {
  Area,
  City,
  Match,
  PartnerInterest,
  Report,
  User,
  UserPreference,
  UserProfile,
  UserSession,
  UserVerification,
} from '../../../models/index.js';
import type { MediaStorage } from '../../../providers/media/index.js';
import {
  computeCompletion,
  toOwnProfileDto,
  toPreferencesDto,
} from '../../profiles/profile.mapper.js';
import { cancelPendingInterestsOf } from '../../interests/connections.js';
import { recordAdminAction } from '../audit/audit.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminActor {
  adminId: string;
  ip: string;
}

export interface AdminUsersService {
  list(
    query: AdminUserListQueryData,
  ): Promise<{ items: AdminUserListItemDto[]; meta: PaginationMeta }>;
  get(userId: string): Promise<AdminUserDetailDto>;
  suspend(actor: AdminActor, userId: string, reason: string): Promise<AdminUserDetailDto>;
  reactivate(actor: AdminActor, userId: string, reason: string): Promise<AdminUserDetailDto>;
  restrictInteractions(
    actor: AdminActor,
    userId: string,
    reason: string,
  ): Promise<AdminUserDetailDto>;
  liftInteractionRestriction(
    actor: AdminActor,
    userId: string,
    reason: string,
  ): Promise<AdminUserDetailDto>;
}

export function createAdminUsersService(deps: {
  sequelize: Sequelize;
  env: ServerEnv;
  media: MediaStorage;
}): AdminUsersService {
  const { sequelize, env, media } = deps;

  /** Builds the search condition. Phone searches match the HMAC — the number is never stored or returned. */
  function searchWhere(q: string): WhereOptions {
    if (UUID_PATTERN.test(q)) return { id: q };
    const phone = normalizeIndianMobile(q);
    if (phone) return { phoneHash: hashPhone(phone, env.PHONE_HASH_SECRET) };
    return { '$profile.display_name$': { [Op.iLike]: `%${escapeLike(q)}%` } };
  }

  /** Counts only: moderators see the shape of a member's activity, never private content. */
  async function connectionSummary(userId: string): Promise<AdminConnectionSummaryDto> {
    const now = new Date();
    const [activeMatches, pendingInterestsSent, pendingInterestsReceived, interestsSentLast24h] =
      await Promise.all([
        Match.count({
          where: { status: 'active', [Op.or]: [{ userAId: userId }, { userBId: userId }] },
        }),
        PartnerInterest.count({
          where: { senderId: userId, status: 'pending', expiresAt: { [Op.gt]: now } },
        }),
        PartnerInterest.count({
          where: { receiverId: userId, status: 'pending', expiresAt: { [Op.gt]: now } },
        }),
        PartnerInterest.count({
          where: {
            senderId: userId,
            createdAt: { [Op.gt]: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          },
        }),
      ]);
    return { activeMatches, pendingInterestsSent, pendingInterestsReceived, interestsSentLast24h };
  }

  /** Admin safety restriction: no sending or accepting interests (docs/matching/matches.md). */
  async function setInteractionRestriction(
    actor: AdminActor,
    userId: string,
    reason: string,
    restricted: boolean,
  ): Promise<AdminUserDetailDto> {
    await sequelize.transaction(async (transaction) => {
      const user = await User.findByPk(userId, { lock: transaction.LOCK.UPDATE, transaction });
      if (!user) throw new AppError('NOT_FOUND', { message: 'User not found.' });
      if ((user.interactionsRestrictedAt !== null) === restricted) {
        throw new AppError('CONFLICT', {
          message: restricted
            ? 'This member is already restricted.'
            : 'This member is not restricted.',
        });
      }
      await user.update(
        { interactionsRestrictedAt: restricted ? new Date() : null },
        { transaction },
      );
      // Pending interests to and from a restricted member are cancelled straight away.
      const cancelledInterests = restricted
        ? await cancelPendingInterestsOf(userId, transaction)
        : 0;
      await recordAdminAction(
        {
          adminId: actor.adminId,
          action: restricted ? 'user.restrict_interactions' : 'user.lift_interaction_restriction',
          targetType: 'user',
          targetId: userId,
          metadata: { reason, cancelledInterests },
          ip: actor.ip,
        },
        env.OTP_HMAC_SECRET,
        transaction,
      );
    });
    return getDetail(userId);
  }

  async function getDetail(userId: string): Promise<AdminUserDetailDto> {
    const user = await User.findByPk(userId);
    if (!user) throw new AppError('NOT_FOUND', { message: 'User not found.' });

    const [profile, preferences, activeSessionCount, verifications, openReportCount, connections] =
      await Promise.all([
        UserProfile.findOne({
          where: { userId },
          include: [
            { model: City, attributes: ['id', 'name', 'state'] },
            { model: Area, attributes: ['id', 'cityId', 'name'] },
          ],
        }),
        UserPreference.findOne({ where: { userId } }),
        UserSession.count({
          where: { userId, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
        }),
        UserVerification.findAll({
          where: { userId },
          attributes: ['type', 'status', 'createdAt', 'decidedAt'],
          order: [['createdAt', 'DESC']],
          limit: 10,
        }),
        Report.count({ where: { reportedUserId: userId, status: ['open', 'in_review'] } }),
        connectionSummary(userId),
      ]);

    const today = todayInIndia();
    const completion = computeCompletion(profile, today);
    return {
      id: user.id,
      accountStatus: user.status,
      profileStatus: completion.status,
      completion,
      photoVerified: user.photoVerifiedAt !== null,
      identityVerified: user.identityVerifiedAt !== null,
      openReportCount,
      hiddenFromDiscovery: user.hiddenFromDiscovery,
      interactionsRestricted: user.interactionsRestrictedAt !== null,
      connections,
      termsVersion: user.termsVersion,
      createdAt: user.createdAt.toISOString(),
      lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
      onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
      deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
      activeSessionCount,
      profile: profile ? toOwnProfileDto(profile, media, today) : null,
      preferences: toPreferencesDto(preferences),
      verifications: verifications.map((v) => ({
        type: v.type,
        status: v.status,
        createdAt: v.createdAt.toISOString(),
        decidedAt: v.decidedAt?.toISOString() ?? null,
      })),
    };
  }

  async function changeStatus(
    actor: AdminActor,
    userId: string,
    reason: string,
    transition: { from: 'active' | 'suspended'; to: 'active' | 'suspended'; action: string },
  ): Promise<AdminUserDetailDto> {
    await sequelize.transaction(async (transaction) => {
      const user = await User.findByPk(userId, { lock: transaction.LOCK.UPDATE, transaction });
      if (!user) throw new AppError('NOT_FOUND', { message: 'User not found.' });
      if (user.status !== transition.from) {
        throw new AppError('CONFLICT', {
          message: `Only ${transition.from} accounts can be ${transition.to === 'suspended' ? 'suspended' : 'reactivated'} (current status: ${user.status}).`,
        });
      }

      await user.update({ status: transition.to }, { transaction });
      if (transition.to === 'suspended') {
        // Immediate effect: every session ends now (the middleware also checks status per request).
        await UserSession.update(
          { revokedAt: new Date(), revokedReason: 'sanction' },
          { where: { userId, revokedAt: null }, transaction },
        );
      }
      await recordAdminAction(
        {
          adminId: actor.adminId,
          action: transition.action,
          targetType: 'user',
          targetId: userId,
          metadata: { reason, from: transition.from, to: transition.to },
          ip: actor.ip,
        },
        env.OTP_HMAC_SECRET,
        transaction,
      );
    });
    return getDetail(userId);
  }

  return {
    async list(query) {
      const limit = Math.min(
        Math.max(query.limit ?? LIMITS.ADMIN_PAGE_SIZE_DEFAULT, 1),
        LIMITS.ADMIN_PAGE_SIZE_MAX,
      );
      const conditions: WhereOptions[] = [];
      if (query.status) conditions.push({ status: query.status });
      if (query.q) conditions.push(searchWhere(query.q));
      if (query.cursor) {
        const cursor = decodeCursor(query.cursor);
        const createdAt = new Date(cursor.createdAt);
        conditions.push({
          [Op.or]: [
            { createdAt: { [Op.lt]: createdAt } },
            { createdAt, id: { [Op.lt]: cursor.id } },
          ],
        });
      }

      const rows = await User.findAll({
        where: { [Op.and]: conditions },
        include: [
          {
            model: UserProfile,
            required: false,
            include: [{ model: City, attributes: ['id', 'name', 'state'] }],
          },
        ],
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: limit + 1,
        subQuery: false,
      });

      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const today = todayInIndia();
      return {
        items: page.map((user) => {
          const profile = user.profile ?? null;
          const completion = computeCompletion(profile, today);
          return {
            id: user.id,
            name: profile?.displayName ?? null,
            accountStatus: user.status,
            profileStatus: completion.status,
            completionPercentage: completion.percentage,
            photoVerified: user.photoVerifiedAt !== null,
            city: profile?.city?.name ?? null,
            thumbnailUrl: profile?.imagePublicId
              ? media.url(profile.imagePublicId, 'thumbnail')
              : null,
            createdAt: user.createdAt.toISOString(),
            lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
          };
        }),
        meta: {
          nextCursor:
            rows.length > limit && last
              ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
              : null,
        },
      };
    },

    get: getDetail,

    suspend: (actor, userId, reason) =>
      changeStatus(actor, userId, reason, {
        from: 'active',
        to: 'suspended',
        action: 'user.suspend',
      }),

    reactivate: (actor, userId, reason) =>
      changeStatus(actor, userId, reason, {
        from: 'suspended',
        to: 'active',
        action: 'user.reactivate',
      }),

    restrictInteractions: (actor, userId, reason) =>
      setInteractionRestriction(actor, userId, reason, true),

    liftInteractionRestriction: (actor, userId, reason) =>
      setInteractionRestriction(actor, userId, reason, false),
  };
}
