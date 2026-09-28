import type { Transaction } from 'sequelize';
import type { HiddenReason } from '@garba-partner/shared';
import { Block, User, UserSession } from '../../models/index.js';

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
 * (Discovery itself arrives with matching; the flag is already honoured there by design.)
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
