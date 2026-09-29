import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import {
  LIMITS,
  calculateAge,
  todayInIndia,
  type PaginationMeta,
  type PartnerDto,
  type PartnerListQueryData,
  type SharedEventDto,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import {
  Area,
  City,
  Event,
  EventAttendance,
  User,
  UserPreference,
  UserProfile,
} from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';
import { toPublicProfileDto } from '../profiles/profile.mapper.js';
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
}

const notFound = () => new AppError('NOT_FOUND', { message: 'Profile not found.' });

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

  /** Builds DTOs through the public allow-list mapper, in ranking order. */
  async function hydrate(viewer: Viewer, rows: CandidateRow[], today: string) {
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return [];
    const [users, profiles, preferences, events] = await Promise.all([
      User.findAll({
        where: { id: ids },
        attributes: ['id', 'photoVerifiedAt', 'identityVerifiedAt'],
      }),
      UserProfile.findAll({
        where: { userId: ids },
        include: [
          { model: City, attributes: ['id', 'name'] },
          { model: Area, attributes: ['id', 'name'] },
        ],
      }),
      UserPreference.findAll({ where: { userId: ids }, attributes: ['userId', 'showArea'] }),
      sharedEvents(viewer.id, ids),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const profileById = new Map(profiles.map((profile) => [profile.userId, profile]));
    const preferenceById = new Map(preferences.map((pref) => [pref.userId, pref]));

    return rows.flatMap((row): PartnerDto[] => {
      const user = userById.get(row.id);
      const profile = profileById.get(row.id);
      if (!user || !profile) return [];
      return [
        {
          profile: toPublicProfileDto(user, profile, preferenceById.get(row.id), media, today),
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
      const { viewer, preferences } = await loadViewer(viewerId, today);
      // The same eligibility rules as the list (no optional filters). Anyone who is blocked,
      // reported, hidden, inactive or outside the mutual preferences is a plain 404.
      const rows = await runQuery({
        viewer,
        today,
        minAge: preferences.ageMin,
        maxAge: preferences.ageMax,
        verifiedOnly: false,
        targetId: partnerId,
        limit: 1,
      });
      const [partner] = await hydrate(viewer, rows, today);
      if (!partner) throw notFound();
      return partner;
    },
  };
}
