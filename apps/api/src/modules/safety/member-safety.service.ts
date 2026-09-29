import {
  guidelineForReason,
  type MemberWarningDto,
  type MySafetyStatusDto,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { User, UserSanction } from '../../models/index.js';

/** Unacknowledged warnings shown at once (older ones stay in the moderator history). */
const WARNINGS_SHOWN = 10;

export interface MemberSafetyService {
  status(userId: string): Promise<MySafetyStatusDto>;
  acknowledgeWarning(userId: string, warningId: string): Promise<MemberWarningDto>;
}

/**
 * What a member sees about moderation on their own account (docs/safety/admin-actions.md#6-what-the-member-sees):
 * restrictions, their end dates and warnings with the guideline they cite. Never the internal
 * note, the report, or who reported.
 */
export function toMemberWarningDto(warning: UserSanction): MemberWarningDto {
  const guideline = guidelineForReason(warning.reasonCode);
  return {
    id: warning.id,
    guideline: guideline
      ? { id: guideline.id, title: guideline.title, summary: guideline.summary }
      : null,
    issuedAt: warning.createdAt.toISOString(),
    acknowledgedAt: warning.acknowledgedAt?.toISOString() ?? null,
  };
}

export function createMemberSafetyService(): MemberSafetyService {
  return {
    async status(userId) {
      const [user, running, warnings] = await Promise.all([
        User.findByPk(userId, { attributes: ['id', 'status', 'chatRestrictedAt'] }),
        UserSanction.findAll({
          where: {
            userId,
            type: ['suspension', 'chat_restriction'],
            revokedAt: null,
            expiredAt: null,
          },
          attributes: ['type', 'endsAt'],
        }),
        UserSanction.findAll({
          where: { userId, type: 'warning', acknowledgedAt: null, revokedAt: null },
          order: [
            ['createdAt', 'DESC'],
            ['id', 'DESC'],
          ],
          limit: WARNINGS_SHOWN,
        }),
      ]);
      if (!user) throw new AppError('UNAUTHENTICATED');
      const endOf = (type: 'suspension' | 'chat_restriction') =>
        running.find((sanction) => sanction.type === type)?.endsAt?.toISOString() ?? null;
      return {
        accountStatus: user.status,
        suspendedUntil: user.status === 'suspended' ? endOf('suspension') : null,
        chatRestricted: user.chatRestrictedAt !== null,
        chatRestrictedUntil: user.chatRestrictedAt !== null ? endOf('chat_restriction') : null,
        warnings: warnings.map(toMemberWarningDto),
      };
    },

    async acknowledgeWarning(userId, warningId) {
      // Scoped to the caller: another member's warning is indistinguishable from a missing one.
      const warning = await UserSanction.findOne({
        where: { id: warningId, userId, type: 'warning', revokedAt: null },
      });
      if (!warning) throw new AppError('NOT_FOUND', { message: 'Warning not found.' });
      if (!warning.acknowledgedAt) await warning.update({ acknowledgedAt: new Date() });
      return toMemberWarningDto(warning);
    },
  };
}
