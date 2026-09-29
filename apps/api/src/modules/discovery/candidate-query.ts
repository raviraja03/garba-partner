import type { Gender, GarbaLevel, PartnerGenderPreference } from '@garba-partner/shared';
import { LIMITS } from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { gendersAcceptedBy, preferencesAccepting, scoreSql } from './matching.js';

/** The viewer's own data, loaded before the query (never taken from the request). */
export interface Viewer {
  id: string;
  gender: Gender;
  age: number;
  cityId: string;
  garbaLevel: GarbaLevel;
  /** Upcoming available dates only. */
  availableDates: string[];
  preference: PartnerGenderPreference;
}

export interface CandidateQuery {
  viewer: Viewer;
  /** Today in IST (`YYYY-MM-DD`). */
  today: string;
  /** Effective age range: the viewer's saved range, optionally narrowed by filters. */
  minAge: number;
  maxAge: number;
  verifiedOnly: boolean;
  eventId?: string | undefined;
  cityId?: string | undefined;
  garbaLevels?: readonly GarbaLevel[] | undefined;
  date?: string | undefined;
  /** Partner detail: restrict to one candidate. */
  targetId?: string | undefined;
  cursor?: PartnerCursor | undefined;
  limit: number;
}

/** One ranked candidate: the signals and the ordering keys (the score never leaves the API). */
export interface CandidateRow {
  id: string;
  score: number;
  active_day: number;
  same_event: boolean;
  shared_dates: boolean;
  same_city: boolean;
  similar_age: boolean;
  same_level: boolean;
  verified: boolean;
}

// --- Cursor: (score DESC, active_day DESC, id ASC) -------------------------------------------

export interface PartnerCursor {
  score: number;
  activeDay: number;
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque to clients. Contains only ordering keys (no score semantics are documented). */
export function encodePartnerCursor(
  row: Pick<CandidateRow, 'score' | 'active_day' | 'id'>,
): string {
  return Buffer.from(JSON.stringify([row.score, row.active_day, row.id]), 'utf8').toString(
    'base64url',
  );
}

export function decodePartnerCursor(value: string): PartnerCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    parsed = null;
  }
  if (Array.isArray(parsed) && parsed.length === 3) {
    const [score, activeDay, id] = parsed as unknown[];
    const isKey = (value: unknown) =>
      Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000;
    if (isKey(score) && isKey(activeDay) && typeof id === 'string' && UUID_PATTERN.test(id)) {
      return { score: score as number, activeDay: activeDay as number, id };
    }
  }
  throw new AppError('VALIDATION_ERROR', {
    details: [{ path: 'cursor', message: 'Invalid cursor.' }],
  });
}

// --- SQL -------------------------------------------------------------------------------------

/** `{2026-10-11,2026-10-12}` — dates are validated `YYYY-MM-DD` strings. */
function dateArrayLiteral(dates: readonly string[]): string {
  return `{${dates.join(',')}}`;
}

/**
 * Eligible, ranked candidates (docs/matching/matching-logic.md#eligibility).
 *
 * Every hard rule is in the WHERE clause, so ranking can never surface an ineligible member.
 * All values are bound replacements; the only interpolated SQL comes from constants.
 */
export function buildCandidateQuery(query: CandidateQuery): {
  sql: string;
  replacements: Record<string, unknown>;
} {
  const { viewer } = query;
  const replacements: Record<string, unknown> = {
    viewerId: viewer.id,
    viewerAge: viewer.age,
    viewerCityId: viewer.cityId,
    viewerLevel: viewer.garbaLevel,
    viewerDates: dateArrayLiteral(viewer.availableDates),
    acceptedGenders: [...gendersAcceptedBy(viewer.preference)],
    acceptingPreferences: preferencesAccepting(viewer.gender),
    today: query.today,
    minAge: query.minAge,
    maxAgePlusOne: query.maxAge + 1,
    similarAge: LIMITS.SIMILAR_AGE_YEARS,
    limit: query.limit,
  };

  const where = [
    'u.id <> :viewerId',
    // Account state: active, onboarded, not auto-hidden after reports, not deleted.
    `u.status = 'active'`,
    'u.deleted_at IS NULL',
    'u.onboarding_completed_at IS NOT NULL',
    'NOT u.hidden_from_discovery',
    // Opted in to discovery, with a profile photo (complete profile).
    'pr.discovery_enabled',
    'p.image_public_id IS NOT NULL',
    // No block in either direction.
    `NOT EXISTS (SELECT 1 FROM blocks b
       WHERE (b.blocker_id = :viewerId AND b.blocked_id = u.id)
          OR (b.blocker_id = u.id AND b.blocked_id = :viewerId))`,
    // Never suggest someone the viewer has reported.
    `NOT EXISTS (SELECT 1 FROM reports r
       WHERE r.reporter_id = :viewerId AND r.reported_user_id = u.id)`,
    // Mutual gender preference.
    'p.gender IN (:acceptedGenders)',
    'pr.partner_gender_preference IN (:acceptingPreferences)',
    // Mutual age preference: candidate within the viewer's range, viewer within the candidate's.
    'p.date_of_birth <= (CAST(:today AS date) - make_interval(years => :minAge))::date',
    'p.date_of_birth > (CAST(:today AS date) - make_interval(years => :maxAgePlusOne))::date',
    ':viewerAge BETWEEN pr.age_min AND pr.age_max',
  ];

  if (query.verifiedOnly) {
    where.push('(u.photo_verified_at IS NOT NULL OR u.identity_verified_at IS NOT NULL)');
  }
  if (query.cityId) {
    where.push('p.city_id = :cityId');
    replacements.cityId = query.cityId;
  }
  if (query.garbaLevels && query.garbaLevels.length > 0) {
    where.push('p.garba_level IN (:garbaLevels)');
    replacements.garbaLevels = [...query.garbaLevels];
  }
  if (query.date) {
    where.push('p.available_dates @> ARRAY[CAST(:date AS date)]');
    replacements.date = query.date;
  }
  if (query.eventId) {
    // Event mode: the candidate is looking for a partner at this event (the service has already
    // checked that the viewer is too — reciprocity).
    where.push(`EXISTS (SELECT 1 FROM event_attendances ea
       WHERE ea.event_id = :eventId AND ea.user_id = u.id AND ea.looking_for_partner)`);
    replacements.eventId = query.eventId;
  }
  if (query.targetId) {
    where.push('u.id = :targetId');
    replacements.targetId = query.targetId;
  }

  let keyset = '';
  if (query.cursor) {
    // (score DESC, active_day DESC, id ASC) expressed as one ascending row comparison.
    keyset =
      'WHERE (0 - s.score, 0 - s.active_day, s.id) > (0 - :cursorScore, 0 - :cursorDay, CAST(:cursorId AS uuid))';
    replacements.cursorScore = query.cursor.score;
    replacements.cursorDay = query.cursor.activeDay;
    replacements.cursorId = query.cursor.id;
  }

  const sql = `
    SELECT s.* FROM (
      SELECT c.*, (${scoreSql('c')}) AS score
      FROM (
        SELECT
          u.id,
          COALESCE((u.last_active_at AT TIME ZONE 'Asia/Kolkata')::date - DATE '2000-01-01', 0)
            AS active_day,
          EXISTS (
            SELECT 1 FROM event_attendances ca
            JOIN event_attendances va
              ON va.event_id = ca.event_id AND va.user_id = :viewerId AND va.looking_for_partner
            JOIN events e
              ON e.id = ca.event_id AND e.status = 'published' AND e.ends_at > now()
            WHERE ca.user_id = u.id AND ca.looking_for_partner
          ) AS same_event,
          (p.available_dates && CAST(:viewerDates AS date[])) AS shared_dates,
          (p.city_id = :viewerCityId) AS same_city,
          (abs(date_part('year', age(CAST(:today AS date), p.date_of_birth)) - :viewerAge)
            <= :similarAge) AS similar_age,
          (p.garba_level = :viewerLevel) AS same_level,
          (u.photo_verified_at IS NOT NULL OR u.identity_verified_at IS NOT NULL) AS verified
        FROM users u
        JOIN user_profiles p ON p.user_id = u.id
        JOIN user_preferences pr ON pr.user_id = u.id
        WHERE ${where.join('\n          AND ')}
      ) c
    ) s
    ${keyset}
    ORDER BY s.score DESC, s.active_day DESC, s.id ASC
    LIMIT :limit`;

  return { sql, replacements };
}
