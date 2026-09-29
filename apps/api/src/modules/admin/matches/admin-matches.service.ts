import { Op } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import { LIMITS, type AdminMatchDto } from '@garba-partner/shared';
import { AppError } from '../../../lib/app-error.js';
import { Event, Match, User, UserProfile } from '../../../models/index.js';
import type { RealtimeHub } from '../../../realtime/hub.js';
import { emitMatchEnded, endConnections, lockPair } from '../../interests/connections.js';
import { recordAdminAction } from '../audit/audit.service.js';
import type { AdminActor } from '../users/admin-users.service.js';

export interface AdminMatchesService {
  /** A member's matches (any status), newest first. Names and IDs only. */
  listForUser(userId: string): Promise<AdminMatchDto[]>;
  /** Moderation: ends an active match and cancels pending interests between the pair. */
  close(actor: AdminActor, matchId: string, reason: string): Promise<AdminMatchDto>;
}

/** Match moderation (docs/matching/matches.md#admin-moderation). */
export function createAdminMatchesService(deps: {
  sequelize: Sequelize;
  env: ServerEnv;
  hub: RealtimeHub;
}): AdminMatchesService {
  const { sequelize, env, hub } = deps;

  async function toDtos(userId: string, matches: Match[]): Promise<AdminMatchDto[]> {
    const partnerIds = matches.map((m) => (m.userAId === userId ? m.userBId : m.userAId));
    const profiles = await UserProfile.findAll({
      where: { userId: partnerIds },
      attributes: ['userId', 'displayName'],
    });
    const nameById = new Map(profiles.map((p) => [p.userId, p.displayName]));
    return matches.map((match) => {
      const partnerId = match.userAId === userId ? match.userBId : match.userAId;
      return {
        id: match.id,
        status: match.status,
        partner: { id: partnerId, name: nameById.get(partnerId) ?? null },
        eventName: match.event?.name ?? null,
        createdAt: match.createdAt.toISOString(),
        endedAt: match.endedAt?.toISOString() ?? null,
      };
    });
  }

  return {
    async listForUser(userId) {
      const user = await User.findByPk(userId, { attributes: ['id'], paranoid: false });
      if (!user) throw new AppError('NOT_FOUND', { message: 'User not found.' });
      const matches = await Match.findAll({
        where: { [Op.or]: [{ userAId: userId }, { userBId: userId }] },
        include: [{ model: Event, attributes: ['name'] }],
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: LIMITS.ADMIN_MATCHES_SHOWN,
      });
      return toDtos(userId, matches);
    },

    async close(actor, matchId, reason) {
      const match = await Match.findByPk(matchId, { attributes: ['id', 'userAId', 'userBId'] });
      if (!match) throw new AppError('NOT_FOUND', { message: 'Match not found.' });
      await sequelize.transaction(async (transaction) => {
        await lockPair(sequelize, match.userAId, match.userBId, transaction);
        const locked = await Match.findByPk(matchId, { attributes: ['status'], transaction });
        if (locked?.status !== 'active') {
          throw new AppError('CONFLICT', { message: 'Only active matches can be closed.' });
        }
        await endConnections(
          match.userAId,
          match.userBId,
          { matchStatus: 'closed', endedByAdminId: actor.adminId },
          transaction,
        );
        await recordAdminAction(
          {
            adminId: actor.adminId,
            action: 'match.close',
            targetType: 'match',
            targetId: matchId,
            metadata: { reason, userAId: match.userAId, userBId: match.userBId },
            ip: actor.ip,
          },
          env.OTP_HMAC_SECRET,
          transaction,
        );
      });
      emitMatchEnded(hub, matchId, match.userAId, match.userBId);
      const closed = await Match.findByPk(matchId, {
        include: [{ model: Event, attributes: ['name'] }],
      });
      if (!closed) throw new AppError('NOT_FOUND', { message: 'Match not found.' });
      const [dto] = await toDtos(closed.userAId, [closed]);
      if (!dto) throw new AppError('NOT_FOUND', { message: 'Match not found.' });
      return dto;
    },
  };
}
