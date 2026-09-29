import type { Express } from 'express';
import request from 'supertest';
import {
  addDays,
  todayInIndia,
  type GarbaLevel,
  type Gender,
  type PartnerGenderPreference,
} from '@garba-partner/shared';
import { AHMEDABAD, bearer } from './event-fixtures.js';
import { loginMember, makeImage, uniqueIp } from './helpers.js';

/** A date of birth that makes someone exactly `age` today (IST), with a safe margin. */
export function dobForAge(age: number): string {
  const [year = '2000', month = '01', day = '01'] = todayInIndia().split('-');
  return addDays(`${String(Number(year) - age)}-${month}-${day}`, -30);
}

export interface MemberOptions {
  name?: string;
  gender?: Gender;
  age?: number;
  cityId?: string;
  areaId?: string | null;
  garbaLevel?: GarbaLevel;
  availableDates?: string[];
  instagramId?: string;
  photo?: boolean;
  preferredGender?: PartnerGenderPreference;
  minAge?: number;
  maxAge?: number;
  discoveryEnabled?: boolean;
  verifiedOnly?: boolean;
  showArea?: boolean;
}

export interface TestMember {
  userId: string;
  accessToken: string;
  phone: string;
}

let counter = 0;
const NAMES = ['Aarav', 'Diya', 'Ishaan', 'Kiara', 'Mihir', 'Nisha', 'Parth', 'Riya', 'Tanvi'];

/**
 * Creates a member through the real API: OTP login → onboarding → photo → preferences.
 * Defaults: a 25-year-old man in Ahmedabad, beginner, discoverable, open to everyone 18–60.
 */
export async function createMember(app: Express, options: MemberOptions = {}): Promise<TestMember> {
  counter += 1;
  // A fresh IP per member keeps the per-IP OTP rate limits out of the way.
  const member = await loginMember(app, uniqueIp());
  const auth = bearer(member.accessToken);

  await request(app)
    .post('/api/v1/me/profile')
    .set(auth)
    .send({
      name: options.name ?? NAMES[counter % NAMES.length],
      dateOfBirth: dobForAge(options.age ?? 25),
      gender: options.gender ?? 'man',
      cityId: options.cityId ?? AHMEDABAD,
      areaId: options.areaId ?? null,
      garbaLevel: options.garbaLevel ?? 'beginner',
      availableDates: options.availableDates ?? [],
      instagramId: options.instagramId ?? 'private.insta',
      confirmsAdult: true,
      acceptTerms: true,
    })
    .expect(201);

  if (options.photo ?? true) {
    await request(app)
      .post('/api/v1/me/profile/image')
      .set(auth)
      .attach('image', await makeImage({ width: 600, height: 800 }), {
        filename: 'me.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);
  }

  await request(app)
    .put('/api/v1/me/preferences')
    .set(auth)
    .send({
      preferredGender: options.preferredGender ?? 'everyone',
      minAge: options.minAge ?? 18,
      maxAge: options.maxAge ?? 60,
      discoveryEnabled: options.discoveryEnabled ?? true,
      verifiedOnly: options.verifiedOnly ?? false,
      showArea: options.showArea ?? false,
    })
    .expect(200);

  return member;
}

/** Two members who matched (mutual interest). */
export async function createMatchedPair(
  app: Express,
  aOptions: MemberOptions = {},
  bOptions: MemberOptions = {},
): Promise<{ a: TestMember; b: TestMember; matchId: string }> {
  const a = await createMember(app, { name: 'Asha', gender: 'woman', ...aOptions });
  const b = await createMember(app, { name: 'Bhavin', ...bOptions });
  await request(app)
    .post('/api/v1/interests')
    .set(bearer(a.accessToken))
    .send({ receiverId: b.userId })
    .expect(201);
  const res = await request(app)
    .post('/api/v1/interests')
    .set(bearer(b.accessToken))
    .send({ receiverId: a.userId })
    .expect(201);
  return { a, b, matchId: (res.body as { data: { match: { id: string } } }).data.match.id };
}

/** Upcoming IST dates, `n` days from today. */
export const upcoming = (days: number) => addDays(todayInIndia(), days);
