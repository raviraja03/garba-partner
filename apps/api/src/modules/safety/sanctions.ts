import { Op, type Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import {
  LIMITS,
  type AdminSanctionDto,
  type HiddenReason,
  type ReportReason,
  type SanctionDurationDays,
  type SanctionType,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { Block, User, UserSanction, UserSession } from '../../models/index.js';
import type { RealtimeHub } from '../../realtime/hub.js';
import { recordAdminAction } from '../admin/audit/audit.service.js';
import {
  cancelPendingInterestsOf,
  emitMatchEnded,
  endAllMatchesOf,
} from '../interests/connections.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Changes an account's status. Suspensions and bans take effect IMMEDIATELY: every session is
 * revoked in the same transaction (and the auth middleware re-checks status on every request).
 * Callers are responsible for authorization and audit logging.
 */
export async function setAccountStatus(
  userId: string,
  status: 'active' | 'suspended' | 'banned',
  transaction: Transaction,
): Promise<void> {
  await User.update({ status }, { where: { id: userId }, transaction });
  if (status !== 'active') {
    await UserSession.update(
      { revokedAt: new Date(), revokedReason: 'sanction' },
      { where: { userId, revokedAt: null }, transaction },
    );
  }
}

/**
 * Hides a member from discovery pending moderator review. Returns true if the flag changed.
 * This is the strongest thing the platform does automatically: it never suspends or bans.
 */
export async function hideFromDiscovery(
  userId: string,
  reason: HiddenReason,
  transaction: Transaction,
): Promise<boolean> {
  const [changed] = await User.update(
    { hiddenFromDiscovery: true, hiddenReason: reason },
    { where: { id: userId, hiddenFromDiscovery: false }, transaction },
  );
  return changed > 0;
}

/** True if either member has blocked the other. */
export async function isBlockedEitherWay(
  userA: string,
  userB: string,
  transaction?: Transaction,
): Promise<boolean> {
  const count = await Block.count({
    where: {
      blockerId: [userA, userB],
      blockedId: [userA, userB],
    },
    ...(transaction ? { transaction } : {}),
  });
  return count > 0;
}

// --- Moderator sanctions (docs/safety/admin-actions.md) ---------------------------------------

export interface SanctionActor {
  adminId: string;
  ip: string;
}

export interface ApplySanctionInput {
  userId: string;
  type: SanctionType;
  /** Guideline category; the member sees it on a warning. */
  reasonCode: ReportReason;
  /** Internal note (sanction row + audit log). Never shown to the member. */
  note: string;
  reportId?: string | null;
  /** Suspensions and chat restrictions only. Omitted = until a moderator lifts it. */
  durationDays?: SanctionDurationDays | undefined;
  /**
   * Report resolution: if the same sanction is already in effect, reuse it instead of failing
   * (a second report about an already-suspended member can still be closed).
   */
  reuseActive?: boolean;
}

/** What must happen on open sockets once the transaction has committed. */
export interface SanctionEffects {
  userId: string;
  disconnect: boolean;
  endedMatches: [string, string][];
}

export interface AppliedSanction {
  /** Null only when reusing a restriction that predates sanction records. */
  sanction: UserSanction | null;
  created: boolean;
  effects: SanctionEffects;
}

const AUDIT_ACTION: Record<SanctionType, string> = {
  warning: 'user.warn',
  chat_restriction: 'user.restrict_chat',
  suspension: 'user.suspend',
  ban: 'user.ban',
};

const ALREADY_ACTIVE: Record<Exclude<SanctionType, 'warning'>, string> = {
  chat_restriction: 'This member is already restricted from chat.',
  suspension: 'This member is already suspended.',
  ban: 'This member is already banned.',
};

const noEffects = (userId: string): SanctionEffects => ({
  userId,
  disconnect: false,
  endedMatches: [],
});

/** Active = not revoked by a moderator and not expired. */
const ACTIVE_WHERE = { revokedAt: null, expiredAt: null } as const;

/**
 * Applies a moderator sanction inside the caller's transaction: records the sanction, updates the
 * cached account state, and writes the audit entry. The platform NEVER calls this on its own;
 * every sanction has a human moderator (`actor`) behind it.
 *
 * - warning: in-app notice the member must acknowledge.
 * - chat_restriction: `users.chat_restricted_at` set; sends fail with `CHAT_RESTRICTED`.
 * - suspension: status `suspended`, every session revoked (the caller disconnects sockets).
 * - ban: status `banned`, sessions revoked, all matches ended, pending interests cancelled.
 */
export async function applySanction(
  actor: SanctionActor,
  input: ApplySanctionInput,
  ipHashSecret: string,
  transaction: Transaction,
): Promise<AppliedSanction> {
  const { userId, type } = input;
  if (input.durationDays !== undefined && type !== 'suspension' && type !== 'chat_restriction') {
    throw new AppError('VALIDATION_ERROR', {
      details: [
        {
          path: 'durationDays',
          message: 'Only suspensions and chat restrictions can have a duration.',
        },
      ],
    });
  }
  const user = await User.findByPk(userId, { lock: transaction.LOCK.UPDATE, transaction });
  if (!user) throw new AppError('NOT_FOUND', { message: 'User not found.' });
  if (user.status === 'pending_deletion') {
    throw new AppError('CONFLICT', { message: 'This account is being deleted.' });
  }
  if (user.status === 'banned' && type !== 'ban') {
    throw new AppError('CONFLICT', { message: 'This account is banned.' });
  }

  if (type !== 'warning') {
    const existing = await UserSanction.findOne({
      where: { userId, type, ...ACTIVE_WHERE },
      transaction,
    });
    // Also covers restrictions applied before sanction records existed.
    const inEffect =
      existing !== null ||
      (type === 'suspension' && user.status === 'suspended') ||
      (type === 'chat_restriction' && user.chatRestrictedAt !== null) ||
      (type === 'ban' && user.status === 'banned');
    if (inEffect) {
      if (!input.reuseActive) throw new AppError('CONFLICT', { message: ALREADY_ACTIVE[type] });
      return { sanction: existing, created: false, effects: noEffects(userId) };
    }
  }

  const now = new Date();
  const sanction = await UserSanction.create(
    {
      userId,
      type,
      reasonCode: input.reasonCode,
      note: input.note,
      reportId: input.reportId ?? null,
      startsAt: now,
      endsAt: input.durationDays ? new Date(now.getTime() + input.durationDays * DAY_MS) : null,
      createdByAdminId: actor.adminId,
    },
    { transaction },
  );

  const effects = noEffects(userId);
  let cancelledInterests = 0;
  switch (type) {
    case 'warning':
      break;
    case 'chat_restriction':
      await user.update({ chatRestrictedAt: now }, { transaction });
      break;
    case 'suspension':
      await setAccountStatus(userId, 'suspended', transaction);
      effects.disconnect = true;
      break;
    case 'ban':
      // A ban supersedes a running suspension (so an expiry can never reactivate a banned account).
      await UserSanction.update(
        { revokedAt: now, revokedByAdminId: actor.adminId, revokeReason: 'Superseded by a ban.' },
        { where: { userId, type: 'suspension', ...ACTIVE_WHERE }, transaction },
      );
      await setAccountStatus(userId, 'banned', transaction);
      effects.endedMatches = await endAllMatchesOf(
        userId,
        { endedByAdminId: actor.adminId },
        transaction,
      );
      cancelledInterests = await cancelPendingInterestsOf(userId, transaction);
      effects.disconnect = true;
      break;
  }

  await recordAdminAction(
    {
      adminId: actor.adminId,
      action: AUDIT_ACTION[type],
      targetType: 'user',
      targetId: userId,
      metadata: {
        sanctionId: sanction.id,
        reason: input.note,
        reasonCode: input.reasonCode,
        reportId: input.reportId ?? null,
        durationDays: input.durationDays ?? null,
        from: user.status,
        ...(type === 'suspension' ? { to: 'suspended' } : {}),
        ...(type === 'ban'
          ? { to: 'banned', matchesEnded: effects.endedMatches.length, cancelledInterests }
          : {}),
      },
      ip: actor.ip,
    },
    ipHashSecret,
    transaction,
  );
  return { sanction, created: true, effects };
}

export type LiftableSanction = Exclude<SanctionType, 'warning'>;

const LIFT_AUDIT_ACTION: Record<LiftableSanction, string> = {
  chat_restriction: 'user.lift_chat_restriction',
  suspension: 'user.reactivate',
  ban: 'user.unban',
};

/**
 * Lifts a chat restriction, suspension or ban: revokes the active sanction rows and restores the
 * account state, audited. Lifting never restores ended matches or chats.
 */
export async function liftSanction(
  actor: SanctionActor,
  input: { userId: string; type: LiftableSanction; reason: string },
  ipHashSecret: string,
  transaction: Transaction,
): Promise<void> {
  const { userId, type } = input;
  const user = await User.findByPk(userId, { lock: transaction.LOCK.UPDATE, transaction });
  if (!user) throw new AppError('NOT_FOUND', { message: 'User not found.' });

  const from = user.status;
  if (type === 'chat_restriction') {
    if (user.chatRestrictedAt === null) {
      throw new AppError('CONFLICT', { message: 'This member is not restricted from chat.' });
    }
    await user.update({ chatRestrictedAt: null }, { transaction });
  } else {
    const required = type === 'suspension' ? 'suspended' : 'banned';
    if (user.status !== required) {
      throw new AppError('CONFLICT', {
        message: `Only ${required} accounts can be ${type === 'suspension' ? 'reactivated' : 'unbanned'} (current status: ${user.status}).`,
      });
    }
    await setAccountStatus(userId, 'active', transaction);
  }

  const [, revoked] = await UserSanction.update(
    { revokedAt: new Date(), revokedByAdminId: actor.adminId, revokeReason: input.reason },
    { where: { userId, type, ...ACTIVE_WHERE }, transaction, returning: true },
  );
  await recordAdminAction(
    {
      adminId: actor.adminId,
      action: LIFT_AUDIT_ACTION[type],
      targetType: 'user',
      targetId: userId,
      metadata: {
        reason: input.reason,
        revokedSanctionIds: revoked.map((sanction) => sanction.id),
        from,
        ...(type === 'chat_restriction' ? {} : { to: 'active' }),
      },
      ip: actor.ip,
    },
    ipHashSecret,
    transaction,
  );
}

/** Pushes a committed sanction to open connections: ended chats close, sockets disconnect. */
export function applySanctionEffects(hub: RealtimeHub, effects: SanctionEffects): void {
  for (const [matchId, partnerId] of effects.endedMatches) {
    emitMatchEnded(hub, matchId, effects.userId, partnerId);
  }
  if (effects.disconnect) hub.disconnectUser(effects.userId, 'account_restricted');
}

export interface ExpiredSanction {
  sanctionId: string;
  userId: string;
  type: SanctionType;
}

/**
 * Ends timed suspensions and chat restrictions whose `ends_at` has passed (run every minute by
 * the expiry job). Safe with several API processes: rows are claimed with SKIP LOCKED.
 * A suspended account only becomes active again if it is still `suspended` (never a ban).
 */
export async function expireSanctions(
  sequelize: Sequelize,
  now: Date = new Date(),
): Promise<ExpiredSanction[]> {
  return sequelize.transaction(async (transaction) => {
    const due = await UserSanction.findAll({
      where: { endsAt: { [Op.lte]: now }, ...ACTIVE_WHERE },
      order: [['endsAt', 'ASC']],
      limit: 200,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
      transaction,
    });
    for (const sanction of due) {
      await sanction.update({ expiredAt: now }, { transaction });
      if (sanction.type === 'suspension') {
        await User.update(
          { status: 'active' },
          { where: { id: sanction.userId, status: 'suspended' }, transaction },
        );
      } else if (sanction.type === 'chat_restriction') {
        await User.update(
          { chatRestrictedAt: null },
          { where: { id: sanction.userId }, transaction },
        );
      }
    }
    return due.map((s) => ({ sanctionId: s.id, userId: s.userId, type: s.type }));
  });
}

export function toAdminSanctionDto(sanction: UserSanction): AdminSanctionDto {
  return {
    id: sanction.id,
    userId: sanction.userId,
    type: sanction.type,
    reasonCode: sanction.reasonCode,
    note: sanction.note,
    reportId: sanction.reportId,
    startsAt: sanction.startsAt.toISOString(),
    endsAt: sanction.endsAt?.toISOString() ?? null,
    createdByAdminId: sanction.createdByAdminId,
    acknowledgedAt: sanction.acknowledgedAt?.toISOString() ?? null,
    revokedAt: sanction.revokedAt?.toISOString() ?? null,
    revokedByAdminId: sanction.revokedByAdminId,
    revokeReason: sanction.revokeReason,
    expiredAt: sanction.expiredAt?.toISOString() ?? null,
    active: sanction.revokedAt === null && sanction.expiredAt === null,
    createdAt: sanction.createdAt.toISOString(),
  };
}

/** A member's sanction history for moderators, newest first. */
export async function loadSanctionHistory(userId: string): Promise<AdminSanctionDto[]> {
  const sanctions = await UserSanction.findAll({
    where: { userId },
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: LIMITS.ADMIN_SANCTIONS_SHOWN,
  });
  return sanctions.map(toAdminSanctionDto);
}
