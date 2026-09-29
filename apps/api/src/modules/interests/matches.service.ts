import { Op, QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import {
  LIMITS,
  todayInIndia,
  type ConnectionListQueryData,
  type MatchDto,
  type PaginationMeta,
  type SharedEventDto,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { decodeCursor, encodeCursor } from '../../lib/pagination.js';
import { Event, Match } from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';
import { loadPublicProfiles } from '../profiles/public-profiles.js';
import type { RealtimeHub } from '../../realtime/hub.js';
import { emitMatchEnded, lockPair } from './connections.js';

export interface MatchesService {
  list(
    userId: string,
    query: ConnectionListQueryData,
  ): Promise<{
    items: MatchDto[];
    meta: PaginationMeta;
  }>;
  get(userId: string, matchId: string): Promise<MatchDto>;
  unmatch(userId: string, matchId: string): Promise<void>;
}

interface MatchRow {
  id: string;
  partner_id: string;
  event_id: string | null;
  status: MatchDto['status'];
  created_at: Date;
}

const notFound = () => new AppError('NOT_FOUND', { message: 'Match not found.' });

/** Event context for interests and matches (any status: a past event still names the context). */
export async function loadEvents(ids: (string | null)[]): Promise<Map<string, SharedEventDto>> {
  const eventIds = [...new Set(ids.filter((id): id is string => id !== null))];
  if (eventIds.length === 0) return new Map();
  const events = await Event.findAll({
    where: { id: eventIds },
    attributes: ['id', 'slug', 'name', 'eventDate'],
  });
  return new Map(
    events.map((e) => [e.id, { id: e.id, slug: e.slug, name: e.name, eventDate: e.eventDate }]),
  );
}

/**
 * Active matches (docs/matching/matches.md). A match is only ever returned to one of its two
 * members, and only while the other member's account is active.
 */
export function createMatchesService(deps: {
  sequelize: Sequelize;
  media: MediaStorage;
  hub: RealtimeHub;
}): MatchesService {
  const { sequelize, media, hub } = deps;

  async function rows(
    userId: string,
    options: { matchId?: string; cursor?: { createdAt: string; id: string }; limit: number },
  ): Promise<MatchRow[]> {
    const replacements: Record<string, unknown> = { userId, limit: options.limit };
    const where = [
      '(m.user_a_id = :userId OR m.user_b_id = :userId)',
      `m.status = 'active'`,
      // The other member must still be an active account.
      `u.status = 'active'`,
      'u.deleted_at IS NULL',
    ];
    if (options.matchId) {
      where.push('m.id = :matchId');
      replacements.matchId = options.matchId;
    }
    if (options.cursor) {
      where.push(
        '(m.created_at, m.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))',
      );
      replacements.cursorCreatedAt = options.cursor.createdAt;
      replacements.cursorId = options.cursor.id;
    }
    return sequelize.query<MatchRow>(
      `SELECT m.id, m.event_id, m.status, m.created_at,
              CASE WHEN m.user_a_id = :userId THEN m.user_b_id ELSE m.user_a_id END AS partner_id
         FROM matches m
         JOIN users u ON u.id = CASE WHEN m.user_a_id = :userId THEN m.user_b_id ELSE m.user_a_id END
        WHERE ${where.join(' AND ')}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT },
    );
  }

  async function toDtos(list: MatchRow[]): Promise<MatchDto[]> {
    const today = todayInIndia();
    const [profiles, events] = await Promise.all([
      loadPublicProfiles(
        list.map((row) => row.partner_id),
        media,
        today,
      ),
      loadEvents(list.map((row) => row.event_id)),
    ]);
    return list.flatMap((row): MatchDto[] => {
      const partner = profiles.get(row.partner_id);
      if (!partner) return [];
      return [
        {
          id: row.id,
          status: row.status,
          createdAt: new Date(row.created_at).toISOString(),
          event: row.event_id ? (events.get(row.event_id) ?? null) : null,
          partner,
        },
      ];
    });
  }

  return {
    async list(userId, query) {
      const limit = Math.min(
        Math.max(query.limit ?? LIMITS.INTERESTS_PAGE_SIZE_DEFAULT, 1),
        LIMITS.INTERESTS_PAGE_SIZE_MAX,
      );
      const found = await rows(userId, {
        ...(query.cursor ? { cursor: decodeCursor(query.cursor) } : {}),
        limit: limit + 1,
      });
      const page = found.slice(0, limit);
      const last = page.at(-1);
      return {
        items: await toDtos(page),
        meta: {
          nextCursor:
            found.length > limit && last
              ? encodeCursor({ createdAt: new Date(last.created_at).toISOString(), id: last.id })
              : null,
        },
      };
    },

    async get(userId, matchId) {
      const [match] = await toDtos(await rows(userId, { matchId, limit: 1 }));
      if (!match) throw notFound();
      return match;
    },

    async unmatch(userId, matchId) {
      const match = await Match.findOne({
        where: { id: matchId, [Op.or]: [{ userAId: userId }, { userBId: userId }] },
        attributes: ['id', 'userAId', 'userBId'],
      });
      if (!match) throw notFound();
      const endedNow = await sequelize.transaction(async (transaction) => {
        await lockPair(sequelize, match.userAId, match.userBId, transaction);
        const [ended] = await Match.update(
          { status: 'unmatched', endedAt: new Date(), endedByUserId: userId },
          { where: { id: matchId, status: 'active' }, transaction },
        );
        // Unmatching twice is not an error, but a match ended another way can't be "unmatched".
        if (ended === 0) {
          const current = await Match.findByPk(matchId, { attributes: ['status'], transaction });
          if (current?.status !== 'unmatched') throw notFound();
        }
        return ended > 0;
      });
      // The chat closes live for both members (no reason is given).
      if (endedNow) emitMatchEnded(hub, matchId, match.userAId, match.userBId);
    },
  };
}
