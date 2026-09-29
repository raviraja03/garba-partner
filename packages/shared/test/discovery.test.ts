import { describe, expect, it } from 'vitest';
import { partnerListQuerySchema, setAttendanceSchema } from '../src/schemas/discovery.schema.js';

describe('partnerListQuerySchema', () => {
  it('parses filters from query-string values', () => {
    const result = partnerListQuerySchema.safeParse({
      cityId: 'c1000000-0000-4000-8000-000000000001',
      minAge: '21',
      maxAge: '30',
      garbaLevels: 'beginner, advanced,beginner',
      date: '2026-10-12',
      verifiedOnly: 'true',
      limit: '10',
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      minAge: 21,
      maxAge: 30,
      garbaLevels: ['beginner', 'advanced'],
      verifiedOnly: true,
      limit: 10,
    });
  });

  it.each([
    { minAge: '17' },
    { maxAge: '101' },
    { minAge: '30', maxAge: '25' },
    { minAge: 'twenty' },
    { garbaLevels: 'expert' },
    { garbaLevels: ',' },
    { date: '2026-02-30' },
    { verifiedOnly: 'yes' },
    { eventId: 'not-a-uuid' },
    { score: '1' },
    { sort: 'score' },
  ])('rejects %o', (query) => {
    expect(partnerListQuerySchema.safeParse(query).success).toBe(false);
  });

  it('accepts an empty query (all defaults come from the member’s preferences)', () => {
    expect(partnerListQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe('setAttendanceSchema', () => {
  it('requires a status and the partner toggle, and nothing else', () => {
    expect(
      setAttendanceSchema.safeParse({ status: 'going', lookingForPartner: true }).success,
    ).toBe(true);
    expect(setAttendanceSchema.safeParse({ status: 'going' }).success).toBe(false);
    expect(
      setAttendanceSchema.safeParse({ status: 'maybe', lookingForPartner: false }).success,
    ).toBe(false);
    expect(
      setAttendanceSchema.safeParse({
        status: 'going',
        lookingForPartner: true,
        userId: '0e4b0c1a-5555-4000-8000-000000000001',
      }).success,
    ).toBe(false);
  });
});
