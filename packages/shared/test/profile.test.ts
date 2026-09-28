import { describe, expect, it } from 'vitest';
import {
  createProfileSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from '../src/schemas/profile.schema.js';
import {
  addDays,
  availableDatesError,
  calculateAge,
  isAdult,
  isIsoDate,
  todayInIndia,
} from '../src/utils/dates.js';
import { computeProfileCompletion } from '../src/utils/profile-completion.js';
import { looksLikeContactInfo, stripInvisible } from '../src/utils/text.js';

const validCreate = {
  name: 'Priya',
  dateOfBirth: '2000-03-14',
  gender: 'woman',
  cityId: 'c1000000-0000-4000-8000-000000000001',
  garbaLevel: 'advanced',
  confirmsAdult: true,
  acceptTerms: true,
};

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('26-01-01')).toBe(false);
  });

  it('computes age in completed years', () => {
    expect(calculateAge('2008-09-28', '2026-09-28')).toBe(18);
    expect(calculateAge('2008-09-29', '2026-09-28')).toBe(17);
    expect(isAdult('2008-09-28', '2026-09-28')).toBe(true);
    expect(isAdult('2008-09-29', '2026-09-28')).toBe(false);
  });

  it('uses India Standard Time for "today"', () => {
    // 20:00 UTC on 27 Sep is already 01:30 on 28 Sep in IST.
    expect(todayInIndia(new Date('2026-09-27T20:00:00Z'))).toBe('2026-09-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('checks available dates against today and the horizon', () => {
    const today = '2026-09-28';
    expect(availableDatesError(['2026-09-28', '2026-10-05'], today)).toBeNull();
    expect(availableDatesError(['2026-09-27'], today)).toMatch(/past/);
    expect(availableDatesError(['2027-12-01'], today)).toMatch(/12 months/);
    expect(availableDatesError(['2026-10-05', '2026-10-05'], today)).toMatch(/once/);
  });
});

describe('text helpers', () => {
  it.each([
    'Call me on 98765 43210',
    'call +91-98765-43210',
    'mail me: priya@example.com',
    'see www.example.com',
    'https://instagram.com/priya',
    'find me on insta.link',
  ])('flags contact info: %s', (text) => {
    expect(looksLikeContactInfo(text)).toBe(true);
  });

  it.each(['Dancing since 2005!', 'Love two-taali and dodhiyu', 'Navratri 9 nights, 3 venues'])(
    'allows normal text: %s',
    (text) => {
      expect(looksLikeContactInfo(text)).toBe(false);
    },
  );

  it('strips zero-width and control characters', () => {
    expect(
      stripInvisible(`Pri${String.fromCodePoint(0x200b)}ya${String.fromCodePoint(0x07)}`),
    ).toBe('Priya');
  });
});

describe('profile completion', () => {
  const allFilled = {
    name: true,
    dateOfBirth: true,
    gender: true,
    city: true,
    garbaLevel: true,
    profileImage: true,
    bio: true,
    availableDates: true,
    area: true,
    instagramId: true,
  };

  it('is not_started without a profile', () => {
    expect(computeProfileCompletion(null)).toMatchObject({ percentage: 0, status: 'not_started' });
  });

  it('is complete at 100% with every field', () => {
    expect(computeProfileCompletion(allFilled)).toEqual({
      percentage: 100,
      status: 'complete',
      missingRequired: [],
      missingOptional: [],
    });
  });

  it('is incomplete when a required field (the photo) is missing', () => {
    const result = computeProfileCompletion({ ...allFilled, profileImage: false });
    expect(result.status).toBe('incomplete');
    expect(result.percentage).toBe(80);
    expect(result.missingRequired).toEqual(['profileImage']);
  });

  it('stays complete when only optional fields are missing', () => {
    const result = computeProfileCompletion({ ...allFilled, bio: false, instagramId: false });
    expect(result).toMatchObject({ status: 'complete', percentage: 85 });
    expect(result.missingOptional).toEqual(['bio', 'instagramId']);
  });
});

describe('profile schemas', () => {
  it('accepts a valid onboarding payload and normalises values', () => {
    const parsed = createProfileSchema.parse({
      ...validCreate,
      name: '  Priya   Shah ',
      instagramId: '@Priya.Dance',
      bio: '  Love garba  ',
    });
    expect(parsed).toMatchObject({
      name: 'Priya Shah',
      instagramId: 'priya.dance',
      bio: 'Love garba',
    });
  });

  it('requires the 18+ confirmation and terms acceptance', () => {
    expect(createProfileSchema.safeParse({ ...validCreate, confirmsAdult: false }).success).toBe(
      false,
    );
    expect(createProfileSchema.safeParse({ ...validCreate, acceptTerms: undefined }).success).toBe(
      false,
    );
  });

  it.each([
    ['name with digits', { name: 'Priya123' }],
    ['one-letter name', { name: 'P' }],
    ['bio with a phone number', { bio: 'whatsapp 9876543210' }],
    ['invalid instagram', { instagramId: 'bad handle!' }],
    ['unknown gender', { gender: 'robot' }],
    ['unknown level', { garbaLevel: 'expert' }],
    ['impossible date', { dateOfBirth: '2001-02-30' }],
    ['unknown key', { phone: '9876543210' }],
  ])('rejects %s', (_label, override) => {
    expect(createProfileSchema.safeParse({ ...validCreate, ...override }).success).toBe(false);
  });

  it('never allows changing the date of birth on update', () => {
    expect(updateProfileSchema.safeParse({ dateOfBirth: '1990-01-01' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ bio: 'Updated bio' }).success).toBe(true);
  });

  it('validates preference age ranges', () => {
    expect(updatePreferencesSchema.safeParse({ minAge: 25, maxAge: 30 }).success).toBe(true);
    expect(updatePreferencesSchema.safeParse({ minAge: 35, maxAge: 30 }).success).toBe(false);
    expect(updatePreferencesSchema.safeParse({ minAge: 17 }).success).toBe(false);
    expect(updatePreferencesSchema.safeParse({ maxAge: 81 }).success).toBe(false);
  });
});
