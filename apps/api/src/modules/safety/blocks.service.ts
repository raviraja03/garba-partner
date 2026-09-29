import type { Sequelize } from 'sequelize-typescript';
import type { BlockedMemberDto } from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { Block, User, UserProfile } from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';
import type { SafetyLogger } from './safety-log.service.js';

export interface BlocksService {
  /** Idempotent. Returns true when a new block was created. */
  block(blockerId: string, targetUserId: string, ip: string): Promise<boolean>;
  unblock(blockerId: string, targetUserId: string): Promise<void>;
  list(blockerId: string): Promise<BlockedMemberDto[]>;
}

/**
 * Blocking (docs/safety/blocking.md): instant, silent (the other member is never told) and
 * symmetric in effect — neither member can see or interact with the other.
 */
export function createBlocksService(deps: {
  sequelize: Sequelize;
  media: MediaStorage;
  safetyLog: SafetyLogger;
}): BlocksService {
  const { media, safetyLog } = deps;

  return {
    async block(blockerId, targetUserId, ip) {
      if (blockerId === targetUserId) {
        throw new AppError('VALIDATION_ERROR', {
          details: [{ path: 'userId', message: "You can't block yourself." }],
        });
      }
      const target = await User.findByPk(targetUserId, { attributes: ['id'] });
      if (!target) throw new AppError('NOT_FOUND', { message: 'Member not found.' });

      const [, created] = await Block.findOrCreate({
        where: { blockerId, blockedId: targetUserId },
        defaults: { blockerId, blockedId: targetUserId },
      });
      if (created) {
        await safetyLog.record({
          eventType: 'safety.block_created',
          severity: 'info',
          userId: blockerId,
          ip,
          metadata: { blockedUserId: targetUserId },
        });
      }
      return created;
    },

    async unblock(blockerId, targetUserId) {
      // Lifting a block never restores anything else (future matches/chats stay ended).
      await Block.destroy({ where: { blockerId, blockedId: targetUserId } });
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
