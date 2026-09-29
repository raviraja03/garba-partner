import {
  GENDERS,
  PARTNER_GENDER_PREFERENCES,
  type Gender,
  type MatchHighlight,
  type PartnerGenderPreference,
} from '@garba-partner/shared';

/**
 * Deterministic ranking of ELIGIBLE candidates (docs/matching/matching-logic.md).
 *
 * The score only orders results. It is internal: it is never returned by the API, because a
 * simple heuristic is not a measure of compatibility (and certainly not of safety).
 */
export const MATCH_WEIGHTS = {
  /** Both are looking for a partner at the same upcoming, published event. */
  sameEvent: 30,
  /** At least one upcoming available date in common. */
  sharedDates: 25,
  /** Same home city. */
  sameCity: 20,
  /** Age preference fit: within `LIMITS.SIMILAR_AGE_YEARS` (both ages already satisfy both ranges). */
  similarAge: 10,
  /** Same Garba level. */
  sameLevel: 10,
  /** Other preferences: the candidate has a verification badge (photo or identity). */
  verified: 5,
} as const;

export type MatchSignal = keyof typeof MATCH_WEIGHTS;
export type MatchSignals = Record<MatchSignal, boolean>;

/** Signal → SQL column produced by the candidate query, and the highlight shown to members. */
export const SIGNALS: readonly {
  signal: MatchSignal;
  column: string;
  highlight: MatchHighlight;
}[] = [
  { signal: 'sameEvent', column: 'same_event', highlight: 'same_event' },
  { signal: 'sharedDates', column: 'shared_dates', highlight: 'shared_dates' },
  { signal: 'sameCity', column: 'same_city', highlight: 'same_city' },
  { signal: 'similarAge', column: 'similar_age', highlight: 'similar_age' },
  { signal: 'sameLevel', column: 'same_level', highlight: 'same_level' },
  { signal: 'verified', column: 'verified', highlight: 'verified' },
];

export function matchScore(signals: MatchSignals): number {
  return SIGNALS.reduce(
    (total, { signal }) => total + (signals[signal] ? MATCH_WEIGHTS[signal] : 0),
    0,
  );
}

/** Plain-language reasons, in a fixed order (strongest first). */
export function matchHighlights(signals: MatchSignals): MatchHighlight[] {
  return SIGNALS.filter(({ signal }) => signals[signal]).map(({ highlight }) => highlight);
}

/**
 * The same score as {@link matchScore}, as SQL over the candidate query's boolean columns.
 * Built only from the constant tables above (no user input).
 */
export function scoreSql(alias: string): string {
  return SIGNALS.map(
    ({ signal, column }) =>
      `(CASE WHEN ${alias}.${column} THEN ${String(MATCH_WEIGHTS[signal])} ELSE 0 END)`,
  ).join(' + ');
}

// --- Mutual gender preference (a hard eligibility rule, not a score) --------------------------

const PREFERENCE_GENDERS: Readonly<Record<PartnerGenderPreference, readonly Gender[]>> = {
  women: ['woman'],
  men: ['man'],
  everyone: GENDERS,
};

/** Genders a member with this preference wants to see. */
export function gendersAcceptedBy(preference: PartnerGenderPreference): readonly Gender[] {
  return PREFERENCE_GENDERS[preference];
}

/** Preferences that accept a member of this gender. */
export function preferencesAccepting(gender: Gender): PartnerGenderPreference[] {
  return PARTNER_GENDER_PREFERENCES.filter((preference) =>
    PREFERENCE_GENDERS[preference].includes(gender),
  );
}

/** True when each member's gender fits the other's preference. */
export function genderPreferencesMatch(
  a: { gender: Gender; preference: PartnerGenderPreference },
  b: { gender: Gender; preference: PartnerGenderPreference },
): boolean {
  return (
    gendersAcceptedBy(a.preference).includes(b.gender) &&
    gendersAcceptedBy(b.preference).includes(a.gender)
  );
}

/** Upcoming dates both members listed (sorted, unique). */
export function sharedUpcomingDates(
  a: readonly string[],
  b: readonly string[],
  today: string,
): string[] {
  const other = new Set(b);
  return [...new Set(a)].filter((date) => date >= today && other.has(date)).sort();
}
