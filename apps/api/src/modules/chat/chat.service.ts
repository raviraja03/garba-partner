import { Op, QueryTypes, type Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import {
  LIMITS,
  looksLikeContactDetails,
  looksLikeMoneyRequest,
  todayInIndia,
  type ChatSummaryDto,
  type MessageDto,
  type MessageListQueryData,
  type PaginationMeta,
  type SendMessageData,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { decodeCursor, encodeCursor } from '../../lib/pagination.js';
import { Block, Match, Message, User } from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';
import type { RealtimeHub } from '../../realtime/hub.js';
import { loadEvents } from '../interests/matches.service.js';
import { lockPair } from '../interests/connections.js';
import { loadPublicProfiles } from '../profiles/public-profiles.js';
import type { SuspiciousActivityDetector } from '../safety/suspicious-activity.service.js';

const PREVIEW_LENGTH = 120;

export interface ChatService {
  list(userId: string, cursor?: string): Promise<{ items: ChatSummaryDto[]; meta: PaginationMeta }>;
  get(userId: string, matchId: string): Promise<ChatSummaryDto>;
  unreadTotal(userId: string): Promise<number>;
  messages(
    userId: string,
    matchId: string,
    query: MessageListQueryData,
  ): Promise<{ items: MessageDto[]; meta: PaginationMeta }>;
  /** Idempotent on (sender, clientMessageId). `created` is false for a retry. */
  send(
    userId: string,
    matchId: string,
    input: SendMessageData,
  ): Promise<{ message: MessageDto; created: boolean }>;
  markRead(
    userId: string,
    matchId: string,
    lastReadMessageId: string,
  ): Promise<{ lastReadAt: string }>;
}

export function toMessageDto(message: Message): MessageDto {
  return {
    id: message.id,
    matchId: message.matchId,
    senderId: message.senderId,
    clientMessageId: message.clientMessageId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

interface ChatRow {
  match_id: string;
  partner_id: string;
  event_id: string | null;
  partner_read_at: Date | null;
  activity_at: Date;
  last_sender_id: string | null;
  last_body: string | null;
  last_created_at: Date | null;
  unread_count: number;
}

/**
 * Chat (docs/chat/architecture.md). The rules are checked on EVERY call, whatever the transport:
 * the match must be active, the caller must be one of its two members, the other member's
 * account must be active and there must be no block between them. Anything else is
 * `404` (not a member) or `409 MATCH_NOT_ACTIVE` (ended / unavailable). A member under a
 * moderator chat restriction can read but not send (`403 CHAT_RESTRICTED`).
 */
export function createChatService(deps: {
  sequelize: Sequelize;
  media: MediaStorage;
  hub: RealtimeHub;
  suspicious: SuspiciousActivityDetector;
}): ChatService {
  const { sequelize, media, hub, suspicious } = deps;

  /** A moderator chat restriction stops sending (reading and read receipts still work). */
  async function assertCanSend(userId: string, transaction?: Transaction): Promise<void> {
    const sender = await User.findByPk(userId, {
      attributes: ['id', 'chatRestrictedAt'],
      ...(transaction ? { transaction } : {}),
    });
    if (sender?.chatRestrictedAt) throw new AppError('CHAT_RESTRICTED');
  }

  /** Loads the match for a member and enforces every chat rule. */
  async function authorize(userId: string, matchId: string, transaction?: Transaction) {
    const options = transaction ? { transaction } : {};
    const match = await Match.findOne({
      where: { id: matchId, [Op.or]: [{ userAId: userId }, { userBId: userId }] },
      ...options,
    });
    // Not a member: indistinguishable from a missing chat (no IDOR oracle).
    if (!match) throw new AppError('NOT_FOUND', { message: 'Chat not found.' });
    const partnerId = match.userAId === userId ? match.userBId : match.userAId;
    if (match.status !== 'active') throw new AppError('MATCH_NOT_ACTIVE');

    const [partner, blocked] = await Promise.all([
      // Paranoid default scope: soft-deleted accounts are not found.
      User.findOne({ where: { id: partnerId, status: 'active' }, attributes: ['id'], ...options }),
      Block.count({
        where: { blockerId: [userId, partnerId], blockedId: [userId, partnerId] },
        ...options,
      }),
    ]);
    if (!partner || blocked > 0) throw new AppError('MATCH_NOT_ACTIVE');
    return { match, partnerId, isUserA: match.userAId === userId };
  }

  /** Active chats of a member (the other member active, no block), newest activity first. */
  async function chatRows(
    userId: string,
    options: { matchId?: string; cursor?: { createdAt: string; id: string }; limit: number },
  ): Promise<ChatRow[]> {
    const replacements: Record<string, unknown> = { userId, limit: options.limit };
    const extra: string[] = [];
    if (options.matchId) {
      extra.push('AND m.id = :matchId');
      replacements.matchId = options.matchId;
    }
    if (options.cursor) {
      extra.push(
        `AND (COALESCE(m.last_message_at, m.created_at), m.id)
           < (CAST(:cursorAt AS timestamptz), CAST(:cursorId AS uuid))`,
      );
      replacements.cursorAt = options.cursor.createdAt;
      replacements.cursorId = options.cursor.id;
    }
    return sequelize.query<ChatRow>(
      `WITH mine AS (
         SELECT m.*,
                CASE WHEN m.user_a_id = :userId THEN m.user_b_id ELSE m.user_a_id END AS partner_id,
                CASE WHEN m.user_a_id = :userId THEN m.user_a_last_read_at
                     ELSE m.user_b_last_read_at END AS my_read_at,
                CASE WHEN m.user_a_id = :userId THEN m.user_b_last_read_at
                     ELSE m.user_a_last_read_at END AS partner_read_at
           FROM matches m
          WHERE (m.user_a_id = :userId OR m.user_b_id = :userId) AND m.status = 'active'
            ${extra.join(' ')}
       )
       SELECT m.id AS match_id, m.partner_id, m.event_id, m.partner_read_at,
              COALESCE(m.last_message_at, m.created_at) AS activity_at,
              lm.sender_id AS last_sender_id, lm.body AS last_body, lm.created_at AS last_created_at,
              (SELECT count(*)::int FROM messages um
                WHERE um.match_id = m.id AND um.sender_id <> :userId
                  AND um.created_at > COALESCE(m.my_read_at, '-infinity'::timestamptz)
              ) AS unread_count
         FROM mine m
         JOIN users u ON u.id = m.partner_id AND u.status = 'active' AND u.deleted_at IS NULL
         LEFT JOIN LATERAL (
           SELECT sender_id, body, created_at FROM messages
            WHERE match_id = m.id ORDER BY created_at DESC, id DESC LIMIT 1
         ) lm ON true
        WHERE NOT EXISTS (SELECT 1 FROM blocks b
                WHERE (b.blocker_id = :userId AND b.blocked_id = m.partner_id)
                   OR (b.blocker_id = m.partner_id AND b.blocked_id = :userId))
        ORDER BY COALESCE(m.last_message_at, m.created_at) DESC, m.id DESC
        LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT },
    );
  }

  async function toSummaries(rows: ChatRow[]): Promise<ChatSummaryDto[]> {
    const [profiles, events] = await Promise.all([
      loadPublicProfiles(
        rows.map((row) => row.partner_id),
        media,
        todayInIndia(),
      ),
      loadEvents(rows.map((row) => row.event_id)),
    ]);
    return rows.flatMap((row): ChatSummaryDto[] => {
      const partner = profiles.get(row.partner_id);
      if (!partner) return [];
      return [
        {
          matchId: row.match_id,
          partner,
          event: row.event_id ? (events.get(row.event_id) ?? null) : null,
          lastMessage:
            row.last_sender_id && row.last_body && row.last_created_at
              ? {
                  senderId: row.last_sender_id,
                  body:
                    row.last_body.length > PREVIEW_LENGTH
                      ? `${row.last_body.slice(0, PREVIEW_LENGTH)}…`
                      : row.last_body,
                  createdAt: new Date(row.last_created_at).toISOString(),
                }
              : null,
          unreadCount: row.unread_count,
          partnerLastReadAt: row.partner_read_at
            ? new Date(row.partner_read_at).toISOString()
            : null,
          lastActivityAt: new Date(row.activity_at).toISOString(),
        },
      ];
    });
  }

  return {
    async list(userId, cursor) {
      const limit = LIMITS.CHATS_PAGE_SIZE;
      const rows = await chatRows(userId, {
        ...(cursor ? { cursor: decodeCursor(cursor) } : {}),
        limit: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: await toSummaries(page),
        meta: {
          nextCursor:
            rows.length > limit && last
              ? encodeCursor({
                  createdAt: new Date(last.activity_at).toISOString(),
                  id: last.match_id,
                })
              : null,
        },
      };
    },

    async get(userId, matchId) {
      await authorize(userId, matchId);
      const [chat] = await toSummaries(await chatRows(userId, { matchId, limit: 1 }));
      if (!chat) throw new AppError('MATCH_NOT_ACTIVE');
      return chat;
    },

    async unreadTotal(userId) {
      const [row] = await sequelize.query<{ total: number }>(
        `SELECT count(*)::int AS total
           FROM messages um
           JOIN matches m ON m.id = um.match_id
           JOIN users u ON u.id = um.sender_id AND u.status = 'active' AND u.deleted_at IS NULL
          WHERE (m.user_a_id = :userId OR m.user_b_id = :userId) AND m.status = 'active'
            AND um.sender_id <> :userId
            AND um.created_at > COALESCE(
              CASE WHEN m.user_a_id = :userId THEN m.user_a_last_read_at ELSE m.user_b_last_read_at END,
              '-infinity'::timestamptz)
            AND NOT EXISTS (SELECT 1 FROM blocks b
                  WHERE (b.blocker_id = :userId AND b.blocked_id = um.sender_id)
                     OR (b.blocker_id = um.sender_id AND b.blocked_id = :userId))`,
        { replacements: { userId }, type: QueryTypes.SELECT },
      );
      return row?.total ?? 0;
    },

    async messages(userId, matchId, query) {
      await authorize(userId, matchId);
      const limit = Math.min(
        Math.max(query.limit ?? LIMITS.MESSAGES_PAGE_SIZE_DEFAULT, 1),
        LIMITS.MESSAGES_PAGE_SIZE_MAX,
      );
      const where: Record<string | symbol, unknown> = { matchId };
      if (query.cursor) {
        const cursor = decodeCursor(query.cursor);
        const createdAt = new Date(cursor.createdAt);
        where[Op.or] = [
          { createdAt: { [Op.lt]: createdAt } },
          { createdAt, id: { [Op.lt]: cursor.id } },
        ];
      }
      const rows = await Message.findAll({
        where,
        // Moderation-only columns are never loaded for members.
        attributes: ['id', 'matchId', 'senderId', 'clientMessageId', 'body', 'createdAt'],
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toMessageDto),
        meta: {
          nextCursor:
            rows.length > limit && last
              ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
              : null,
        },
      };
    },

    async send(userId, matchId, input) {
      // A retry of an already-stored message returns it (no second copy, no rate-limit cost).
      const retried = await Message.findOne({
        where: { senderId: userId, clientMessageId: input.clientMessageId },
      });
      if (retried) {
        if (retried.matchId !== matchId) {
          throw new AppError('CONFLICT', { message: 'This message id was already used.' });
        }
        return { message: toMessageDto(retried), created: false };
      }

      await assertCanSend(userId);
      if (!hub.messageLimiter.take(userId)) {
        throw new AppError('RATE_LIMITED', {
          message: "You're sending messages too quickly. Please slow down.",
          retryAfterSeconds: hub.messageLimiter.retryAfterSeconds(userId),
        });
      }

      const first = await authorize(userId, matchId);
      const { message, partnerId, created } = await sequelize.transaction(async (transaction) => {
        // Same lock as block/unmatch/moderation: a block that commits first always wins.
        await lockPair(sequelize, userId, first.partnerId, transaction);
        const { match, partnerId: partner } = await authorize(userId, matchId, transaction);
        await assertCanSend(userId, transaction);
        const [row, isNew] = await Message.findOrCreate({
          where: { senderId: userId, clientMessageId: input.clientMessageId },
          defaults: {
            matchId,
            senderId: userId,
            clientMessageId: input.clientMessageId,
            body: input.body,
            containsContactInfo: looksLikeContactDetails(input.body),
            containsMoneyRequest: looksLikeMoneyRequest(input.body),
          },
          transaction,
        });
        if (row.matchId !== matchId) {
          throw new AppError('CONFLICT', { message: 'This message id was already used.' });
        }
        if (isNew) await match.update({ lastMessageAt: row.createdAt }, { transaction });
        return { message: row, partnerId: partner, created: isNew };
      });

      const dto = toMessageDto(message);
      if (created) {
        // After commit only: both members' rooms (the sender's other tabs included).
        hub.toUser(partnerId, 'message:new', dto);
        hub.toUser(userId, 'message:new', dto);
        // Scam and spam patterns go to the moderation queue (never blocks the send).
        await suspicious.afterMessage(message);
      }
      return { message: dto, created };
    },

    async markRead(userId, matchId, lastReadMessageId) {
      const { partnerId, isUserA } = await authorize(userId, matchId);
      const message = await Message.findOne({
        where: { id: lastReadMessageId, matchId },
        attributes: ['id', 'createdAt'],
      });
      if (!message) throw new AppError('NOT_FOUND', { message: 'Message not found.' });

      // Read positions only move forward. The column name comes from a constant, not input.
      const column = isUserA ? 'user_a_last_read_at' : 'user_b_last_read_at';
      const [rows] = await sequelize.query(
        `UPDATE matches
            SET ${column} = GREATEST(COALESCE(${column}, '-infinity'::timestamptz), :readAt)
          WHERE id = :matchId
      RETURNING ${column} AS last_read_at`,
        { replacements: { matchId, readAt: message.createdAt } },
      );
      const updated = (rows as { last_read_at: Date }[])[0];
      const lastReadAt = new Date(updated?.last_read_at ?? message.createdAt).toISOString();
      hub.toUser(partnerId, 'message:read', { matchId, userId, lastReadAt });
      return { lastReadAt };
    },
  };
}
