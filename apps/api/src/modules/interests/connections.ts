import { Op, type Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { canonicalPair, Match, PartnerInterest } from '../../models/index.js';
import type { RealtimeHub } from '../../realtime/hub.js';

/**
 * Serialises every interest/match/message change for one PAIR of members (in either order) for
 * the rest of the transaction. Together with the unique indexes this makes "exactly one match"
 * hold even when both members act at the same moment, and guarantees no message is stored after
 * a block that committed first.
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
 * interests (either direction) are cancelled and an active match is ended. Nobody is notified
 * of the reason. Returns the ended match's ID (to emit `match:ended` after commit).
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
): Promise<string | null> {
  const now = new Date();
  await PartnerInterest.update(
    { status: 'cancelled', respondedAt: now },
    { where: pendingBetween(a, b), transaction },
  );
  const active = await Match.findOne({
    where: { ...canonicalPair(a, b), status: 'active' },
    attributes: ['id'],
    transaction,
  });
  if (!active) return null;
  await Match.update(
    {
      status: ending.matchStatus,
      endedAt: now,
      endedByUserId: ending.endedByUserId ?? null,
      endedByAdminId: ending.endedByAdminId ?? null,
    },
    { where: { id: active.id }, transaction },
  );
  return active.id;
}

/** Tells both members' open apps that a chat is gone (call AFTER the transaction commits). */
export function emitMatchEnded(
  hub: RealtimeHub,
  matchId: string | null,
  a: string,
  b: string,
): void {
  if (!matchId) return;
  hub.toUser(a, 'match:ended', { matchId });
  hub.toUser(b, 'match:ended', { matchId });
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

/**
 * Ends every active match of a member (ban): returns `[matchId, partnerId]` pairs so the caller
 * can emit `match:ended` after commit.
 */
export async function endAllMatchesOf(
  userId: string,
  ending: { endedByAdminId: string },
  transaction: Transaction,
): Promise<[string, string][]> {
  const matches = await Match.findAll({
    where: { status: 'active', [Op.or]: [{ userAId: userId }, { userBId: userId }] },
    attributes: ['id', 'userAId', 'userBId'],
    transaction,
  });
  if (matches.length === 0) return [];
  await Match.update(
    { status: 'closed', endedAt: new Date(), endedByAdminId: ending.endedByAdminId },
    { where: { id: matches.map((m) => m.id) }, transaction },
  );
  return matches.map((m) => [m.id, m.userAId === userId ? m.userBId : m.userAId]);
}
