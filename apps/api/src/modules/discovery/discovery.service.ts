import { Op, QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import {
  LIMITS,
  calculateAge,
  todayInIndia,
  type ConnectionDto,
  type PaginationMeta,
  type PartnerDto,
  type PartnerListQueryData,
  type SharedEventDto,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import {
  Event,
  EventAttendance,
  Match,
  PartnerInterest,
  UserPreference,
  UserProfile,
} from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';
import { loadPublicProfiles } from '../profiles/public-profiles.js';
import {
  buildCandidateQuery,
  decodePartnerCursor,
  encodePartnerCursor,
  type CandidateQuery,
  type CandidateRow,
  type Viewer,
} from './candidate-query.js';
import { matchHighlights, sharedUpcomingDates } from './matching.js';

export interface DiscoveryService {
  list(
    viewerId: string,
    query: PartnerListQueryData,
  ): Promise<{ items: PartnerDto[]; meta: PaginationMeta }>;
  get(viewerId: string, partnerId: string): Promise<PartnerDto>;
  /**
   * True when `targetId` passes every hard eligibility rule for `viewerId` (account state,
   * blocks, reports, restrictions, recent decline, mutual preferences). Used by interests.
   */
  isEligible(viewerId: string, targetId: string): Promise<boolean>;
}

const notFound = () => new AppError('NOT_FOUND', { message: 'Profile not found.' });
const NO_CONNECTION: ConnectionDto = { status: 'none', interestId: null, matchId: null };

/** Partner discovery (docs/matching/discovery.md). */
export function createDiscoveryService(deps: {
  sequelize: Sequelize;
  media: MediaStorage;
}): DiscoveryService {
  const { sequelize, media } = deps;

  /** The viewer's profile and preferences, from the database (never from the request). */
  async function loadViewer(viewerId: string, today: string) {
    const [profile, preferences] = await Promise.all([
      UserProfile.findOne({ where: { userId: viewerId } }),
      UserPreference.findOne({ where: { userId: viewerId } }),
    ]);
    if (!profile || !preferences) throw new AppError('ONBOARDING_REQUIRED');
    const viewer: Viewer = {
      id: viewerId,
      gender: profile.gender,
      age: calculateAge(profile.dateOfBirth, today),
      cityId: profile.cityId,
      garbaLevel: profile.garbaLevel,
      availableDates: profile.availableDates.filter((date) => date >= today),
      preference: preferences.partnerGenderPreference,
    };
    return { viewer, preferences };
  }

  /** Event mode is reciprocal: the viewer must be looking for a partner at the event too. */
  async function assertEventMode(viewerId: string, eventId: string): Promise<void> {
    const event = await Event.findOne({
      where: { id: eventId, status: 'published' },
      attributes: ['id', 'endsAt'],
    });
    if (!event) throw new AppError('NOT_FOUND', { message: 'Event not found.' });
    if (event.endsAt <= new Date()) throw new AppError('EVENT_NOT_OPEN');
    const mine = await EventAttendance.findOne({
      where: { eventId, userId: viewerId, lookingForPartner: true },
      attributes: ['id'],
    });
    if (!mine) throw new AppError('PARTNER_TOGGLE_REQUIRED');
  }

  function runQuery(query: CandidateQuery): Promise<CandidateRow[]> {
    const { sql, replacements } = buildCandidateQuery(query);
    return sequelize.query<CandidateRow>(sql, { replacements, type: QueryTypes.SELECT });
  }

  /** One candidate against the member's saved preferences only (no optional filters). */
  async function findEligible(viewerId: string, targetId: string, today: string) {
    const { viewer, preferences } = await loadViewer(viewerId, today);
    const rows = await runQuery({
      viewer,
      today,
      minAge: preferences.ageMin,
      maxAge: preferences.ageMax,
      verifiedOnly: false,
      targetId,
      limit: 1,
    });
    return { viewer, row: rows[0] };
  }

  /** Upcoming events both members are looking for a partner at (reciprocal), soonest first. */
  async function sharedEvents(viewerId: string, ids: string[]) {
    const byUser = new Map<string, SharedEventDto[]>();
    if (ids.length === 0) return byUser;
    const rows = await sequelize.query<{
      user_id: string;
      id: string;
      slug: string;
      name: string;
      event_date: string;
    }>(
      `SELECT ca.user_id, e.id, e.slug, e.name, e.event_date::text AS event_date
         FROM event_attendances ca
         JOIN event_attendances va
           ON va.event_id = ca.event_id AND va.user_id = :viewerId AND va.looking_for_partner
         JOIN events e ON e.id = ca.event_id AND e.status = 'published' AND e.ends_at > now()
        WHERE ca.user_id IN (:ids) AND ca.looking_for_partner
        ORDER BY e.starts_at, e.id`,
      { replacements: { viewerId, ids }, type: QueryTypes.SELECT },
    );
    for (const row of rows) {
      const list = byUser.get(row.user_id) ?? [];
      if (list.length < LIMITS.SHARED_EVENTS_SHOWN) {
        list.push({ id: row.id, slug: row.slug, name: row.name, eventDate: row.event_date });
      }
      byUser.set(row.user_id, list);
    }
    return byUser;
  }

  /** Pending interests and active matches between the viewer and these members. */
  async function connections(viewerId: string, ids: string[]) {
    const byUser = new Map<string, ConnectionDto>();
    if (ids.length === 0) return byUser;
    const [interests, matches] = await Promise.all([
      PartnerInterest.findAll({
        where: {
          status: 'pending',
          expiresAt: { [Op.gt]: new Date() },
          [Op.or]: [
            { senderId: viewerId, receiverId: ids },
            { receiverId: viewerId, senderId: ids },
          ],
        },
        attributes: ['id', 'senderId', 'receiverId'],
      }),
      Match.findAll({
        where: {
          status: 'active',
          [Op.or]: [
            { userAId: viewerId, userBId: ids },
            { userBId: viewerId, userAId: ids },
          ],
        },
        attributes: ['id', 'userAId', 'userBId'],
      }),
    ]);
    for (const interest of interests) {
      const sent = interest.senderId === viewerId;
      byUser.set(sent ? interest.receiverId : interest.senderId, {
        status: sent ? 'interest_sent' : 'interest_received',
        interestId: interest.id,
        matchId: null,
      });
    }
    for (const match of matches) {
      byUser.set(match.userAId === viewerId ? match.userBId : match.userAId, {
        status: 'matched',
        interestId: null,
        matchId: match.id,
      });
    }
    return byUser;
  }

  /** Builds DTOs through the public allow-list mapper, in ranking order. */
  async function hydrate(viewer: Viewer, rows: CandidateRow[], today: string) {
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return [];
    const [profiles, events, connected] = await Promise.all([
      loadPublicProfiles(ids, media, today),
      sharedEvents(viewer.id, ids),
      connections(viewer.id, ids),
    ]);
    return rows.flatMap((row): PartnerDto[] => {
      const profile = profiles.get(row.id);
      if (!profile) return [];
      return [
        {
          profile,
          highlights: matchHighlights({
            sameEvent: row.same_event,
            sharedDates: row.shared_dates,
            sameCity: row.same_city,
            similarAge: row.similar_age,
            sameLevel: row.same_level,
            verified: row.verified,
          }),
          sharedDates: sharedUpcomingDates(profile.availableDates, viewer.availableDates, today),
          sharedEvents: events.get(row.id) ?? [],
          connection: connected.get(row.id) ?? NO_CONNECTION,
        },
      ];
    });
  }

  return {
    async list(viewerId, query) {
      const today = todayInIndia();
      const { viewer, preferences } = await loadViewer(viewerId, today);
      if (query.eventId) await assertEventMode(viewerId, query.eventId);

      // Filters can only NARROW the member's saved age range.
      const minAge = Math.max(preferences.ageMin, query.minAge ?? LIMITS.PREF_AGE_MIN);
      const maxAge = Math.min(preferences.ageMax, query.maxAge ?? LIMITS.MAX_AGE);
      if (minAge > maxAge) return { items: [], meta: { nextCursor: null } };

      const limit = Math.min(
        Math.max(query.limit ?? LIMITS.DISCOVERY_PAGE_SIZE_DEFAULT, 1),
        LIMITS.DISCOVERY_PAGE_SIZE_MAX,
      );
      const rows = await runQuery({
        viewer,
        today,
        minAge,
        maxAge,
        verifiedOnly: query.verifiedOnly ?? preferences.verifiedOnly,
        eventId: query.eventId,
        cityId: query.cityId,
        garbaLevels: query.garbaLevels,
        date: query.date,
        excludeConnected: true,
        cursor: query.cursor ? decodePartnerCursor(query.cursor) : undefined,
        limit: limit + 1,
      });

      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: await hydrate(viewer, page, today),
        meta: { nextCursor: rows.length > limit && last ? encodePartnerCursor(last) : null },
      };
    },

    async get(viewerId, partnerId) {
      if (viewerId === partnerId) throw notFound();
      const today = todayInIndia();
      // The same eligibility rules as the list (no optional filters). Anyone who is blocked,
      // reported, hidden, inactive or outside the mutual preferences is a plain 404. Members
      // already matched or with a pending interest ARE shown (with their connection status).
      const { viewer, row } = await findEligible(viewerId, partnerId, today);
      const [partner] = await hydrate(viewer, row ? [row] : [], today);
      if (!partner) throw notFound();
      return partner;
    },

    async isEligible(viewerId, targetId) {
      if (viewerId === targetId) return false;
      const { row } = await findEligible(viewerId, targetId, todayInIndia());
      return row !== undefined;
    },
  };
}
