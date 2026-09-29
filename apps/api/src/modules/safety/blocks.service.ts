import type { Sequelize } from 'sequelize-typescript';
import type { BlockedMemberDto } from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { Block, User, UserProfile } from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';
import type { RealtimeHub } from '../../realtime/hub.js';
import { emitMatchEnded, endConnections, lockPair } from '../interests/connections.js';
import type { SafetyLogger } from './safety-log.service.js';
import type { SuspiciousActivityDetector } from './suspicious-activity.service.js';

export interface BlocksService {
  /** Idempotent. Returns true when a new block was created. */
  block(blockerId: string, targetUserId: string, ip: string): Promise<boolean>;
  /** Idempotent. Returns true when a block was removed. */
  unblock(blockerId: string, targetUserId: string, ip: string): Promise<boolean>;
  list(blockerId: string): Promise<BlockedMemberDto[]>;
}

/**
 * Blocking (docs/safety/abuse-prevention.md#2-blocking): instant, silent (the other member is never told) and
 * symmetric in effect — neither member can see or interact with the other.
 */
export function createBlocksService(deps: {
  sequelize: Sequelize;
  media: MediaStorage;
  safetyLog: SafetyLogger;
  hub: RealtimeHub;
  suspicious: SuspiciousActivityDetector;
}): BlocksService {
  const { sequelize, media, safetyLog, hub, suspicious } = deps;

  return {
    async block(blockerId, targetUserId, ip) {
      if (blockerId === targetUserId) {
        throw new AppError('VALIDATION_ERROR', {
          details: [{ path: 'userId', message: "You can't block yourself." }],
        });
      }
      const target = await User.findByPk(targetUserId, { attributes: ['id'] });
      if (!target) throw new AppError('NOT_FOUND', { message: 'Member not found.' });

      const { created, endedMatchId } = await sequelize.transaction(async (transaction) => {
        await lockPair(sequelize, blockerId, targetUserId, transaction);
        const [, isNew] = await Block.findOrCreate({
          where: { blockerId, blockedId: targetUserId },
          defaults: { blockerId, blockedId: targetUserId },
          transaction,
        });
        // A block ends everything between the two: pending interests and any active match
        // (so the chat closes for both, live).
        const ended = await endConnections(
          blockerId,
          targetUserId,
          { matchStatus: 'blocked', endedByUserId: blockerId },
          transaction,
        );
        return { created: isNew, endedMatchId: ended };
      });
      emitMatchEnded(hub, endedMatchId, blockerId, targetUserId);
      if (created) {
        await safetyLog.record({
          eventType: 'safety.block_created',
          severity: 'info',
          userId: blockerId,
          ip,
          metadata: { blockedUserId: targetUserId },
        });
        // Many members blocking the same person is a signal for moderators (never a sanction).
        await suspicious.afterBlock(targetUserId);
      }
      return created;
    },

    async unblock(blockerId, targetUserId, ip) {
      // Lifting a block never restores anything else (past matches and chats stay ended).
      const removed = await Block.destroy({ where: { blockerId, blockedId: targetUserId } });
      if (removed > 0) {
        // Block/unblock churn can be used to harass: it is logged and rate-limited.
        await safetyLog.record({
          eventType: 'safety.block_removed',
          severity: 'info',
          userId: blockerId,
          ip,
          metadata: { unblockedUserId: targetUserId },
        });
      }
      return removed > 0;
    },

    async list(blockerId) {
      const blocks = await Block.findAll({
        where: { blockerId },
        include: [
          {
            model: User,
            as: 'blocked',
            attributes: ['id'],
            include: [{ model: UserProfile, attributes: ['displayName', 'imagePublicId'] }],
          },
        ],
        order: [['createdAt', 'DESC']],
      });
      return blocks.map((block) => {
        const profile = block.blocked?.profile ?? null;
        return {
          userId: block.blockedId,
          name: profile?.displayName ?? null,
          thumbnailUrl: profile?.imagePublicId
            ? media.url(profile.imagePublicId, 'thumbnail')
            : null,
          blockedAt: block.createdAt.toISOString(),
        };
      });
    },
  };
}
