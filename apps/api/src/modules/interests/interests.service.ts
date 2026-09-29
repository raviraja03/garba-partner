import { Op, QueryTypes, UniqueConstraintError, type Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import {
  LIMITS,
  todayInIndia,
  type ConnectionListQueryData,
  type InterestDto,
  type MatchDto,
  type PaginationMeta,
  type SendInterestData,
  type SendInterestResultDto,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { decodeCursor, encodeCursor } from '../../lib/pagination.js';
import {
  canonicalPair,
  Event,
  EventAttendance,
  Match,
  PartnerInterest,
  User,
  UserPreference,
  UserProfile,
} from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';
import type { DiscoveryService } from '../discovery/discovery.service.js';
import { loadPublicProfiles } from '../profiles/public-profiles.js';
import type { Notifier } from '../notifications/notifications.service.js';
import type { SafetyLogger } from '../safety/safety-log.service.js';
import { lockPair, pendingBetween } from './connections.js';
import { loadEvents, type MatchesService } from './matches.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SendInterestOutcome extends SendInterestResultDto {
  /** A new interest or match was created (HTTP 201) rather than an existing one returned. */
  created: boolean;
}

export interface InterestsService {
  send(senderId: string, input: SendInterestData, ip: string): Promise<SendInterestOutcome>;
  received(
    userId: string,
    query: ConnectionListQueryData,
  ): Promise<{
    items: InterestDto[];
    meta: PaginationMeta;
  }>;
  sent(
    userId: string,
    query: ConnectionListQueryData,
  ): Promise<{
    items: InterestDto[];
    meta: PaginationMeta;
  }>;
  accept(userId: string, interestId: string): Promise<MatchDto>;
  reject(userId: string, interestId: string): Promise<void>;
  withdraw(userId: string, interestId: string): Promise<void>;
}

interface InterestRow {
  id: string;
  member_id: string;
  event_id: string | null;
  status: InterestDto['status'];
  created_at: Date;
  expires_at: Date;
}

const interestNotFound = () => new AppError('NOT_FOUND', { message: 'Interest not found.' });

/**
 * Interests (docs/matching/interests.md): request → accept. Every rule is re-checked on the
 * server at send and accept time; the client is never trusted.
 */
export function createInterestsService(deps: {
  sequelize: Sequelize;
  media: MediaStorage;
  discovery: DiscoveryService;
  matches: MatchesService;
  safetyLog: SafetyLogger;
  notifier: Notifier;
}): InterestsService {
  const { sequelize, media, discovery, matches, safetyLog, notifier } = deps;

  /** Members under review or restriction can't create new connections. */
  async function assertCanInteract(userId: string): Promise<void> {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'hiddenFromDiscovery', 'interactionsRestrictedAt'],
    });
    if (!user) throw new AppError('UNAUTHENTICATED');
    if (user.hiddenFromDiscovery || user.interactionsRestrictedAt) {
      throw new AppError('INTERACTIONS_RESTRICTED');
    }
  }

  /** An event can be mentioned only if both are looking for a partner at it, and it's open. */
  async function assertSharedEvent(a: string, b: string, eventId: string): Promise<void> {
    const event = await Event.findOne({
      where: { id: eventId, status: 'published', endsAt: { [Op.gt]: new Date() } },
      attributes: ['id'],
    });
    const both = await EventAttendance.count({
      where: { eventId, userId: [a, b], lookingForPartner: true },
    });
    if (!event || both < 2) {
      throw new AppError('VALIDATION_ERROR', {
        details: [
          {
            path: 'eventId',
            message: "You can only mention an event you're both looking for a partner at.",
          },
        ],
      });
    }
  }

  /** Stale pending interests between the pair become `expired` (keeps the unique index free). */
  function expireStale(a: string, b: string, transaction: Transaction) {
    return PartnerInterest.update(
      { status: 'expired', respondedAt: new Date() },
      { where: { ...pendingBetween(a, b), expiresAt: { [Op.lte]: new Date() } }, transaction },
    );
  }

  /**
   * Received or sent pending interests. The other member must still be available: active, not
   * hidden or restricted, and no block or report between the two.
   */
  async function list(
    userId: string,
    direction: 'received' | 'sent',
    query: ConnectionListQueryData,
  ) {
    const limit = Math.min(
      Math.max(query.limit ?? LIMITS.INTERESTS_PAGE_SIZE_DEFAULT, 1),
      LIMITS.INTERESTS_PAGE_SIZE_MAX,
    );
    const [mine, other] =
      direction === 'received' ? ['receiver_id', 'sender_id'] : ['sender_id', 'receiver_id'];
    const replacements: Record<string, unknown> = { userId, limit: limit + 1 };
    let keyset = '';
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      keyset =
        'AND (pi.created_at, pi.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))';
      replacements.cursorCreatedAt = cursor.createdAt;
      replacements.cursorId = cursor.id;
    }
    // Column names come from the constant tuple above, never from input.
    const found = await sequelize.query<InterestRow>(
      `SELECT pi.id, pi.${other} AS member_id, pi.event_id, pi.status, pi.created_at, pi.expires_at
         FROM partner_interests pi
         JOIN users u ON u.id = pi.${other}
        WHERE pi.${mine} = :userId AND pi.status = 'pending' AND pi.expires_at > now()
          AND u.status = 'active' AND u.deleted_at IS NULL
          AND NOT u.hidden_from_discovery AND u.interactions_restricted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM blocks b
                WHERE (b.blocker_id = pi.sender_id AND b.blocked_id = pi.receiver_id)
                   OR (b.blocker_id = pi.receiver_id AND b.blocked_id = pi.sender_id))
          AND NOT EXISTS (SELECT 1 FROM reports r
                WHERE (r.reporter_id = pi.sender_id AND r.reported_user_id = pi.receiver_id)
                   OR (r.reporter_id = pi.receiver_id AND r.reported_user_id = pi.sender_id))
          ${keyset}
        ORDER BY pi.created_at DESC, pi.id DESC
        LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT },
    );

    const page = found.slice(0, limit);
    const last = page.at(-1);
    const [profiles, events] = await Promise.all([
      loadPublicProfiles(
        page.map((row) => row.member_id),
        media,
        todayInIndia(),
      ),
      loadEvents(page.map((row) => row.event_id)),
    ]);
    const items = page.flatMap((row): InterestDto[] => {
      const member = profiles.get(row.member_id);
      if (!member) return [];
      return [
        {
          id: row.id,
          status: row.status,
          createdAt: new Date(row.created_at).toISOString(),
          expiresAt: new Date(row.expires_at).toISOString(),
          event: row.event_id ? (events.get(row.event_id) ?? null) : null,
          member,
        },
      ];
    });
    return {
      items,
      meta: {
        nextCursor:
          found.length > limit && last
            ? encodeCursor({ createdAt: new Date(last.created_at).toISOString(), id: last.id })
            : null,
      },
    };
  }

  /** Moves a pending interest owned by `userId` (as sender or receiver) to a final status. */
  async function respond(
    userId: string,
    interestId: string,
    role: 'senderId' | 'receiverId',
    status: 'declined' | 'withdrawn',
  ): Promise<void> {
    const interest = await PartnerInterest.findOne({
      where: { id: interestId, [role]: userId },
      attributes: ['id'],
    });
    // Someone else's interest is indistinguishable from a missing one (no IDOR oracle).
    if (!interest) throw interestNotFound();
    const [changed] = await PartnerInterest.update(
      { status, respondedAt: new Date() },
      {
        where: {
          id: interestId,
          [role]: userId,
          status: 'pending',
          expiresAt: { [Op.gt]: new Date() },
        },
      },
    );
    if (changed === 0) throw new AppError('INTEREST_NOT_PENDING');
  }

  return {
    async send(senderId, input, ip) {
      const receiverId = input.receiverId.toLowerCase();
      if (receiverId === senderId) {
        throw new AppError('VALIDATION_ERROR', {
          details: [{ path: 'receiverId', message: "You can't send an interest to yourself." }],
        });
      }
      await assertCanInteract(senderId);
      const [preferences, profile] = await Promise.all([
        UserPreference.findOne({ where: { userId: senderId }, attributes: ['discoveryEnabled'] }),
        UserProfile.findOne({ where: { userId: senderId }, attributes: ['imagePublicId'] }),
      ]);
      if (!profile?.imagePublicId) throw new AppError('ONBOARDING_REQUIRED');
      // No sending while invisible: members with discovery off can browse but not reach out.
      if (!preferences?.discoveryEnabled) throw new AppError('DISCOVERY_DISABLED');

      const sentToday = await PartnerInterest.count({
        where: { senderId, createdAt: { [Op.gt]: new Date(Date.now() - DAY_MS) } },
      });
      if (sentToday >= LIMITS.INTERESTS_PER_DAY) {
        await safetyLog.record({
          eventType: 'interest.limit_reached',
          severity: 'warning',
          userId: senderId,
          ip,
          metadata: { sentLast24h: sentToday },
        });
        throw new AppError('INTEREST_LIMIT_REACHED', { retryAfterSeconds: 60 * 60 });
      }

      // Every hard rule (blocks, reports, sanctions, recent decline, mutual preferences…). The
      // answer is deliberately generic so it never reveals WHY someone is unavailable.
      if (!(await discovery.isEligible(senderId, receiverId))) {
        throw new AppError('USER_UNAVAILABLE');
      }
      if (input.eventId) await assertSharedEvent(senderId, receiverId, input.eventId);

      let outcome: { interestId: string; matchId: string | null; alreadySent: boolean };
      try {
        outcome = await sequelize.transaction(async (transaction) => {
          await lockPair(sequelize, senderId, receiverId, transaction);
          await expireStale(senderId, receiverId, transaction);

          const pair = canonicalPair(senderId, receiverId);
          const active = await Match.findOne({
            where: { ...pair, status: 'active' },
            attributes: ['id'],
            transaction,
          });
          if (active) throw new AppError('ALREADY_MATCHED');

          const pending = await PartnerInterest.findOne({
            where: pendingBetween(senderId, receiverId),
            transaction,
          });
          if (pending?.senderId === senderId) {
            return { interestId: pending.id, matchId: null, alreadySent: true };
          }
          if (pending) {
            // They already sent one: this is mutual interest → accept theirs and match.
            await pending.update({ status: 'accepted', respondedAt: new Date() }, { transaction });
            const match = await Match.create(
              {
                ...pair,
                interestId: pending.id,
                eventId: pending.eventId ?? input.eventId ?? null,
              },
              { transaction },
            );
            return { interestId: pending.id, matchId: match.id, alreadySent: false };
          }
          const interest = await PartnerInterest.create(
            {
              senderId,
              receiverId,
              eventId: input.eventId ?? null,
              expiresAt: new Date(Date.now() + LIMITS.INTEREST_EXPIRY_DAYS * DAY_MS),
            },
            { transaction },
          );
          return { interestId: interest.id, matchId: null, alreadySent: false };
        });
      } catch (error) {
        // Belt and braces: the pair lock prevents this, and the unique indexes make it impossible
        // for a duplicate pending interest or active match to be stored.
        if (error instanceof UniqueConstraintError) throw new AppError('CONFLICT');
        throw error;
      }

      // After commit: mutual interest → both hear about the match; otherwise the receiver
      // hears about the interest. A repeated send notifies nobody.
      if (outcome.matchId && !outcome.alreadySent) {
        await notifier.notify({
          userId: receiverId,
          type: 'match_created',
          actorUserId: senderId,
          matchId: outcome.matchId,
        });
        await notifier.notify({
          userId: senderId,
          type: 'match_created',
          actorUserId: receiverId,
          matchId: outcome.matchId,
        });
      } else if (!outcome.alreadySent) {
        await notifier.notify({
          userId: receiverId,
          type: 'interest_received',
          actorUserId: senderId,
          interestId: outcome.interestId,
        });
      }

      const match = outcome.matchId ? await matches.get(senderId, outcome.matchId) : null;
      return {
        interestId: outcome.interestId,
        matched: match !== null,
        match,
        alreadySent: outcome.alreadySent,
        created: !outcome.alreadySent,
      };
    },

    received: (userId, query) => list(userId, 'received', query),
    sent: (userId, query) => list(userId, 'sent', query),

    async accept(userId, interestId) {
      const interest = await PartnerInterest.findOne({
        where: { id: interestId, receiverId: userId },
      });
      if (!interest) throw interestNotFound();
      if (interest.status !== 'pending') throw new AppError('INTEREST_NOT_PENDING');
      await assertCanInteract(userId);

      const now = new Date();
      if (interest.expiresAt <= now) {
        await PartnerInterest.update(
          { status: 'expired', respondedAt: now },
          { where: { id: interestId, status: 'pending' } },
        );
        throw new AppError('INTEREST_NOT_PENDING', { message: 'This interest has expired.' });
      }
      // Re-check eligibility now: the sender may have been blocked, reported, suspended or
      // restricted since sending. If so the interest is cancelled.
      if (!(await discovery.isEligible(userId, interest.senderId))) {
        await PartnerInterest.update(
          { status: 'cancelled', respondedAt: now },
          { where: { id: interestId, status: 'pending' } },
        );
        throw new AppError('USER_UNAVAILABLE');
      }

      const accepted = await sequelize.transaction(async (transaction) => {
        await lockPair(sequelize, userId, interest.senderId, transaction);
        const locked = await PartnerInterest.findByPk(interestId, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (locked?.status !== 'pending') throw new AppError('INTEREST_NOT_PENDING');

        const pair = canonicalPair(userId, interest.senderId);
        await locked.update({ status: 'accepted', respondedAt: new Date() }, { transaction });
        const existing = await Match.findOne({
          where: { ...pair, status: 'active' },
          attributes: ['id'],
          transaction,
        });
        if (existing) return { matchId: existing.id, created: false };
        const match = await Match.create(
          { ...pair, interestId, eventId: locked.eventId },
          { transaction },
        );
        return { matchId: match.id, created: true };
      });
      if (accepted.created) {
        await notifier.notify({
          userId: interest.senderId,
          type: 'interest_accepted',
          actorUserId: userId,
          interestId,
          matchId: accepted.matchId,
        });
      }
      return matches.get(userId, accepted.matchId);
    },

    reject: (userId, interestId) => respond(userId, interestId, 'receiverId', 'declined'),

    withdraw: (userId, interestId) => respond(userId, interestId, 'senderId', 'withdrawn'),
  };
}
