import { describe, expect, it } from 'vitest';
import {
  buildCandidateQuery,
  decodePartnerCursor,
  encodePartnerCursor,
  type CandidateQuery,
} from './candidate-query.js';
import {
  MATCH_WEIGHTS,
  SIGNALS,
  genderPreferencesMatch,
  gendersAcceptedBy,
  matchHighlights,
  matchScore,
  preferencesAccepting,
  scoreSql,
  sharedUpcomingDates,
  type MatchSignals,
} from './matching.js';

const none: MatchSignals = {
  sameEvent: false,
  sharedDates: false,
  sameCity: false,
  similarAge: false,
  sameLevel: false,
  verified: false,
};

describe('matchScore', () => {
  it('uses the documented weights', () => {
    expect(MATCH_WEIGHTS).toEqual({
      sameEvent: 30,
      sharedDates: 25,
      sameCity: 20,
      similarAge: 10,
      sameLevel: 10,
      verified: 5,
    });
    expect(matchScore(none)).toBe(0);
    expect(matchScore({ ...none, sameEvent: true })).toBe(30);
    expect(matchScore({ ...none, sharedDates: true, sameCity: true })).toBe(45);
    const all = Object.fromEntries(Object.keys(none).map((key) => [key, true])) as MatchSignals;
    expect(matchScore(all)).toBe(100);
  });

  it('is deterministic and orders stronger signals first', () => {
    const event = matchScore({ ...none, sameEvent: true });
    const date = matchScore({ ...none, sharedDates: true });
    const city = matchScore({ ...none, sameCity: true });
    expect(event).toBeGreaterThan(date);
    expect(date).toBeGreaterThan(city);
    expect(matchScore({ ...none, sameCity: true })).toBe(matchScore({ ...none, sameCity: true }));
  });

  it('describes a candidate with highlights in a fixed order, never a number', () => {
    expect(matchHighlights({ ...none, verified: true, sameEvent: true, sameCity: true })).toEqual([
      'same_event',
      'same_city',
      'verified',
    ]);
    expect(matchHighlights(none)).toEqual([]);
  });

  it('generates SQL with exactly the same weights', () => {
    const sql = scoreSql('c');
    for (const { signal, column } of SIGNALS) {
      expect(sql).toContain(`WHEN c.${column} THEN ${String(MATCH_WEIGHTS[signal])} ELSE 0`);
    }
    expect(SIGNALS).toHaveLength(Object.keys(MATCH_WEIGHTS).length);
  });
});

describe('gender preferences', () => {
  it('maps preferences to genders', () => {
    expect(gendersAcceptedBy('women')).toEqual(['woman']);
    expect(gendersAcceptedBy('men')).toEqual(['man']);
    expect(gendersAcceptedBy('everyone')).toEqual(['woman', 'man', 'non_binary']);
    expect(preferencesAccepting('woman')).toEqual(['women', 'everyone']);
    expect(preferencesAccepting('non_binary')).toEqual(['everyone']);
  });

  it('requires a mutual fit', () => {
    const woman = { gender: 'woman' as const, preference: 'men' as const };
    expect(genderPreferencesMatch(woman, { gender: 'man', preference: 'women' })).toBe(true);
    expect(genderPreferencesMatch(woman, { gender: 'man', preference: 'men' })).toBe(false);
    expect(genderPreferencesMatch(woman, { gender: 'woman', preference: 'everyone' })).toBe(false);
    expect(
      genderPreferencesMatch(
        { gender: 'non_binary', preference: 'everyone' },
        { gender: 'woman', preference: 'everyone' },
      ),
    ).toBe(true);
  });
});

describe('sharedUpcomingDates', () => {
  it('returns sorted, unique, upcoming dates in both lists', () => {
    expect(
      sharedUpcomingDates(
        ['2026-10-12', '2026-10-01', '2026-09-01', '2026-10-12'],
        ['2026-10-12', '2026-09-01', '2026-10-01', '2026-10-20'],
        '2026-09-29',
      ),
    ).toEqual(['2026-10-01', '2026-10-12']);
  });
});

describe('partner cursor', () => {
  it('round-trips ordering keys', () => {
    const id = '0e4b0c1a-5555-4000-8000-000000000001';
    const cursor = encodePartnerCursor({ score: 45, active_day: 9770, id });
    expect(decodePartnerCursor(cursor)).toEqual({ score: 45, activeDay: 9770, id });
  });

  it.each([
    'not-a-cursor',
    Buffer.from('[1,2]').toString('base64url'),
    Buffer.from('[-5,1,"0e4b0c1a-5555-4000-8000-000000000001"]').toString('base64url'),
    Buffer.from('[1.5,1,"0e4b0c1a-5555-4000-8000-000000000001"]').toString('base64url'),
    Buffer.from('[1,1,"x\' OR 1=1 --"]').toString('base64url'),
  ])('rejects %s', (value) => {
    expect(() => decodePartnerCursor(value)).toThrow();
  });
});

describe('buildCandidateQuery', () => {
  const base: CandidateQuery = {
    viewer: {
      id: '0e4b0c1a-5555-4000-8000-000000000001',
      gender: 'woman',
      age: 25,
      cityId: 'c1000000-0000-4000-8000-000000000001',
      garbaLevel: 'beginner',
      availableDates: ['2026-10-12'],
      preference: 'men',
    },
    today: '2026-09-29',
    minAge: 21,
    maxAge: 30,
    verifiedOnly: false,
    limit: 21,
  };

  it('binds every value as a replacement (no user input in the SQL text)', () => {
    const { sql, replacements } = buildCandidateQuery({
      ...base,
      cityId: 'c1000000-0000-4000-8000-000000000002',
      garbaLevels: ['advanced'],
      date: '2026-10-12',
      eventId: '0e4b0c1a-5555-4000-8000-000000000009',
      cursor: { score: 45, activeDay: 9000, id: '0e4b0c1a-5555-4000-8000-000000000003' },
    });
    for (const value of ['0e4b0c1a', 'c1000000', '2026-10-12', 'advanced', 'woman']) {
      expect(sql).not.toContain(value);
    }
    expect(replacements).toMatchObject({
      acceptedGenders: ['man'],
      acceptingPreferences: ['women', 'everyone'],
      viewerDates: '{2026-10-12}',
      minAge: 21,
      maxAgePlusOne: 31,
      garbaLevels: ['advanced'],
    });
  });

  it('always contains every hard eligibility rule', () => {
    const { sql } = buildCandidateQuery(base);
    for (const rule of [
      'u.id <> :viewerId',
      `u.status = 'active'`,
      'u.deleted_at IS NULL',
      'NOT u.hidden_from_discovery',
      'pr.discovery_enabled',
      'p.image_public_id IS NOT NULL',
      'FROM blocks b',
      'FROM reports r',
      'p.gender IN (:acceptedGenders)',
      'pr.partner_gender_preference IN (:acceptingPreferences)',
      ':viewerAge BETWEEN pr.age_min AND pr.age_max',
    ]) {
      expect(sql).toContain(rule);
    }
    expect(sql).not.toContain('city_id = :cityId');
    expect(sql).not.toMatch(/phone|instagram/i);
  });
});
