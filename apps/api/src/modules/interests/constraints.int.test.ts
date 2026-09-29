import { UniqueConstraintError } from 'sequelize';
import { beforeEach, describe, expect, it } from 'vitest';
import { canonicalPair, Match, PartnerInterest } from '../../models/index.js';
import { createTestApp, hasTestDatabase, useTestDatabase } from '../../test/helpers.js';
import { createMember } from '../../test/member-fixtures.js';

/** A unique violation raised by PostgreSQL for this exact constraint or index. */
const violates = (constraint: string) =>
  expect.objectContaining({
    name: 'SequelizeUniqueConstraintError',
    parent: expect.objectContaining({ constraint }) as unknown,
  }) as unknown;

/**
 * The database itself must refuse duplicate interests and matches, even if application code
 * were bypassed or buggy (docs/matching/interests.md#database-guarantees).
 */
describe.skipIf(!hasTestDatabase)('interest and match database constraints', () => {
  const db = useTestDatabase();
  let a: string;
  let b: string;
  const inTwoWeeks = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  beforeEach(async () => {
    const app = createTestApp({ sequelize: db() });
    a = (await createMember(app)).userId;
    b = (await createMember(app)).userId;
  });

  it('allows at most one pending interest per pair, in either direction', async () => {
    await PartnerInterest.create({ senderId: a, receiverId: b, expiresAt: inTwoWeeks() });
    const pendingUnique = violates('partner_interests_one_pending_per_pair_unique');
    await expect(
      PartnerInterest.create({ senderId: a, receiverId: b, expiresAt: inTwoWeeks() }),
    ).rejects.toEqual(pendingUnique);
    await expect(
      PartnerInterest.create({ senderId: b, receiverId: a, expiresAt: inTwoWeeks() }),
    ).rejects.toEqual(pendingUnique);
    // Non-pending history rows are allowed.
    await PartnerInterest.create({
      senderId: a,
      receiverId: b,
      status: 'withdrawn',
      respondedAt: new Date(),
      expiresAt: inTwoWeeks(),
    });
  });

  it('rejects self-interests and inconsistent states', async () => {
    await expect(
      PartnerInterest.create({ senderId: a, receiverId: a, expiresAt: inTwoWeeks() }),
    ).rejects.toThrow(/not_self/);
    await expect(
      PartnerInterest.create({
        senderId: a,
        receiverId: b,
        status: 'declined',
        expiresAt: inTwoWeeks(),
      }),
    ).rejects.toThrow(/responded/);
  });

  it('allows at most one active match per pair and one match per interest', async () => {
    const pair = canonicalPair(a, b);
    const interest = await PartnerInterest.create({
      senderId: a,
      receiverId: b,
      status: 'accepted',
      respondedAt: new Date(),
      expiresAt: inTwoWeeks(),
    });
    await Match.create({ ...pair, interestId: interest.id });
    await expect(Match.create({ ...pair })).rejects.toEqual(
      violates('matches_one_active_per_pair_unique'),
    );
    await expect(
      Match.create({ ...pair, interestId: interest.id, status: 'unmatched', endedAt: new Date() }),
    ).rejects.toEqual(violates('matches_interest_unique'));
    // Ended matches are history: a new active match is allowed after the old one ends.
    await Match.update({ status: 'unmatched', endedAt: new Date() }, { where: pair });
    await Match.create({ ...pair });
    await expect(Match.create({ ...pair })).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it('stores pairs only in canonical order', async () => {
    const { userAId, userBId } = canonicalPair(a, b);
    await expect(Match.create({ userAId: userBId, userBId: userAId })).rejects.toThrow(
      /canonical_order/,
    );
    await expect(Match.create({ userAId, userBId: userAId })).rejects.toThrow(/canonical_order/);
  });
});
