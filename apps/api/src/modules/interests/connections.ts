import { Op, type Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { canonicalPair, Match, PartnerInterest } from '../../models/index.js';

/**
 * Serialises every interest/match change for one PAIR of members (in either order) for the rest
 * of the transaction. Together with the unique indexes this makes "exactly one match" hold even
 * when both members act at the same moment.
 */
export async function lockPair(
  sequelize: Sequelize,
  a: string,
  b: string,
  transaction: Transaction,
): Promise<void> {
  const { userAId, userBId } = canonicalPair(a, b);
  await sequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))', {
    replacements: { key: `pair:${userAId}:${userBId}` },
    transaction,
  });
}

/** Pending interests between two members, in either direction. */
export function pendingBetween(a: string, b: string) {
  return {
    status: 'pending' as const,
    [Op.or]: [
      { senderId: a, receiverId: b },
      { senderId: b, receiverId: a },
    ],
  };
}

/**
 * Ends everything between two members after a block, report or moderation action: pending
 * interests (either direction) are cancelled and an active match is ended. Nobody is notified.
 */
export async function endConnections(
  a: string,
  b: string,
  ending: {
    matchStatus: 'blocked' | 'closed';
    endedByUserId?: string | null;
    endedByAdminId?: string | null;
  },
  transaction: Transaction,
): Promise<void> {
  const now = new Date();
  await PartnerInterest.update(
    { status: 'cancelled', respondedAt: now },
    { where: pendingBetween(a, b), transaction },
  );
  await Match.update(
    {
      status: ending.matchStatus,
      endedAt: now,
      endedByUserId: ending.endedByUserId ?? null,
      endedByAdminId: ending.endedByAdminId ?? null,
    },
    { where: { ...canonicalPair(a, b), status: 'active' }, transaction },
  );
}

/** Cancels every pending interest a member sent or received (e.g. an admin restriction). */
export async function cancelPendingInterestsOf(
  userId: string,
  transaction: Transaction,
): Promise<number> {
  const [count] = await PartnerInterest.update(
    { status: 'cancelled', respondedAt: new Date() },
    {
      where: { status: 'pending', [Op.or]: [{ senderId: userId }, { receiverId: userId }] },
      transaction,
    },
  );
  return count;
}
