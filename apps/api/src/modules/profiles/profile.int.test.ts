import type { Express } from 'express';
import sharp from 'sharp';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { LIMITS, addDays, todayInIndia } from '@garba-partner/shared';
import { User, UserPreference, UserProfile, UserVerification } from '../../models/index.js';
import {
  createFakeMediaStorage,
  createTestApp,
  createTestEnv,
  hasTestDatabase,
  loginMember,
  makeImage,
  uniqueIp,
  useTestDatabase,
  type FakeMediaStorage,
} from '../../test/helpers.js';

// Reference data from 20260928100000-create-cities-and-areas.
const AHMEDABAD = 'c1000000-0000-4000-8000-000000000001';
const VADODARA = 'c1000000-0000-4000-8000-000000000002';
const NAVRANGPURA = 'a2000000-0001-4000-8000-000000000001';
const ALKAPURI_VADODARA = 'a2000000-0002-4000-8000-000000000001';

const env = createTestEnv();

function adultDob(years = 26): string {
  return addDays(todayInIndia(), -Math.ceil(years * 365.25) - 10);
}

function validProfile(overrides: Record<string, unknown> = {}) {
  const today = todayInIndia();
  return {
    name: 'Priya',
    dateOfBirth: adultDob(),
    gender: 'woman',
    cityId: AHMEDABAD,
    areaId: NAVRANGPURA,
    bio: 'Dancing since school.',
    instagramId: '@Priya.Garba',
    garbaLevel: 'advanced',
    availableDates: [addDays(today, 10), addDays(today, 3)],
    confirmsAdult: true,
    acceptTerms: true,
    ...overrides,
  };
}

describe.skipIf(!hasTestDatabase)('profiles (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let media: FakeMediaStorage;
  let ip: string;

  beforeEach(() => {
    media = createFakeMediaStorage();
    app = createTestApp({ sequelize: db(), env, media });
    ip = uniqueIp();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const getMine = (token: string) => request(app).get('/api/v1/me/profile').set(auth(token));
  const create = (token: string, body: unknown) =>
    request(app)
      .post('/api/v1/me/profile')
      .set(auth(token))
      .send(body as object);
  const patch = (token: string, body: unknown) =>
    request(app)
      .patch('/api/v1/me/profile')
      .set(auth(token))
      .send(body as object);
  const upload = (token: string, image: Buffer, contentType = 'image/jpeg', filename = 'me.jpg') =>
    request(app)
      .post('/api/v1/me/profile/image')
      .set(auth(token))
      .attach('image', image, { filename, contentType });

  /** A member with a complete profile (all fields + photo). */
  async function completeMember(overrides: Record<string, unknown> = {}) {
    const member = await loginMember(app, ip);
    expect((await create(member.accessToken, validProfile(overrides))).status).toBe(201);
    expect(
      (await upload(member.accessToken, await makeImage({ width: 600, height: 800 }))).status,
    ).toBe(200);
    return member;
  }

  describe('reference data', () => {
    it('lists launch cities and their areas publicly', async () => {
      const cities = await request(app).get('/api/v1/cities');
      expect(cities.status).toBe(200);
      expect(cities.body.data).toHaveLength(6);
      expect(cities.body.data[0]).toEqual({ id: AHMEDABAD, name: 'Ahmedabad', state: 'Gujarat' });

      const areas = await request(app).get(`/api/v1/cities/${AHMEDABAD}/areas`);
      expect(areas.body.data).toContainEqual({
        id: NAVRANGPURA,
        cityId: AHMEDABAD,
        name: 'Navrangpura',
      });

      expect((await request(app).get(`/api/v1/cities/${crypto.randomUUID()}/areas`)).status).toBe(
        404,
      );
    });
  });

  describe('create and get own profile', () => {
    it('reports not_started before a profile exists', async () => {
      const { accessToken } = await loginMember(app, ip);

      const res = await getMine(accessToken);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        profileStatus: 'not_started',
        completion: { percentage: 0, status: 'not_started' },
        profile: null,
        preferences: null,
        accountStatus: 'active',
      });
    });

    it('creates a profile: normalised fields, default preferences, incomplete until a photo exists', async () => {
      const { accessToken, userId } = await loginMember(app, ip);

      const res = await create(accessToken, validProfile({ name: '  Priya   Shah ' }));

      expect(res.status).toBe(201);
      const data = res.body.data;
      expect(data.profileStatus).toBe('incomplete');
      expect(data.completion).toEqual({
        percentage: 80,
        status: 'incomplete',
        missingRequired: ['profileImage'],
        missingOptional: [],
      });
      expect(data.profile).toMatchObject({
        name: 'Priya Shah',
        age: 26,
        instagramId: 'priya.garba',
        city: { id: AHMEDABAD, name: 'Ahmedabad' },
        area: { id: NAVRANGPURA, name: 'Navrangpura' },
        image: null,
      });
      // Dates are de-duplicated and sorted.
      expect(data.profile.availableDates).toEqual([
        addDays(todayInIndia(), 3),
        addDays(todayInIndia(), 10),
      ]);
      // Privacy by default.
      expect(data.preferences).toEqual({
        preferredGender: 'everyone',
        minAge: 18,
        maxAge: 80,
        verifiedOnly: false,
        discoveryEnabled: false,
        showArea: false,
      });
      const user = await User.findByPk(userId);
      expect(user?.termsVersion).toBe('2026-09-01');
      expect(user?.onboardingCompletedAt).toBeNull();
    });

    it('accepts a member who turns 18 today', async () => {
      const { accessToken } = await loginMember(app, ip);
      const today = todayInIndia();
      const eighteenToday = `${String(Number(today.slice(0, 4)) - 18)}${today.slice(4)}`;

      expect((await create(accessToken, validProfile({ dateOfBirth: eighteenToday }))).status).toBe(
        201,
      );
    });

    it('rejects under-18s and locks the date of birth afterwards', async () => {
      const { accessToken, userId } = await loginMember(app, ip);
      const today = todayInIndia();
      const seventeen = addDays(`${String(Number(today.slice(0, 4)) - 18)}${today.slice(4)}`, 1);

      const res = await create(accessToken, validProfile({ dateOfBirth: seventeen }));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNDERAGE');
      expect((await User.findByPk(userId))?.underageRejectedAt).not.toBeNull();

      // Retrying with an adult date does not work.
      const retry = await create(accessToken, validProfile());
      expect(retry.status).toBe(403);
      expect(retry.body.error.code).toBe('UNDERAGE');
      expect(await UserProfile.count()).toBe(0);
    });

    it.each([
      ['an unknown city', { cityId: '6f1c2b1e-9a3b-4c7e-8d1a-0b2c3d4e5f60' }, 'cityId'],
      ['an area of another city', { cityId: VADODARA, areaId: NAVRANGPURA }, 'areaId'],
      [
        'a past available date',
        { availableDates: [addDays(todayInIndia(), -1)] },
        'availableDates',
      ],
      ['a bio with a phone number', { bio: 'Call 98765 43210' }, 'bio'],
      ['a name with digits', { name: 'Priya007' }, 'name'],
      ['no 18+ confirmation', { confirmsAdult: false }, 'confirmsAdult'],
      ['an unrealistic birth date', { dateOfBirth: '1900-01-01' }, 'dateOfBirth'],
    ])('rejects %s with VALIDATION_ERROR', async (_label, override, path) => {
      const { accessToken } = await loginMember(app, ip);

      const res = await create(accessToken, validProfile(override));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
    });

    it('rejects a second profile with CONFLICT', async () => {
      const { accessToken } = await loginMember(app, ip);
      await create(accessToken, validProfile());

      expect((await create(accessToken, validProfile())).status).toBe(409);
    });

    it('hides past available dates', async () => {
      const { accessToken, userId } = await loginMember(app, ip);
      await create(accessToken, validProfile());
      const past = addDays(todayInIndia(), -5);
      const future = addDays(todayInIndia(), 5);
      await UserProfile.update({ availableDates: [past, future] }, { where: { userId } });

      expect((await getMine(accessToken)).body.data.profile.availableDates).toEqual([future]);
    });

    it('requires authentication', async () => {
      expect((await request(app).get('/api/v1/me/profile')).status).toBe(401);
      expect((await request(app).post('/api/v1/me/profile').send(validProfile())).status).toBe(401);
    });
  });

  describe('update profile and preferences', () => {
    it('updates fields, clears the area when the city changes, and never changes the date of birth', async () => {
      const { accessToken } = await loginMember(app, ip);
      await create(accessToken, validProfile());

      const moved = await patch(accessToken, { cityId: VADODARA, bio: 'New bio', instagramId: '' });
      expect(moved.status).toBe(200);
      expect(moved.body.data.profile).toMatchObject({
        city: { id: VADODARA },
        area: null,
        bio: 'New bio',
        instagramId: null,
      });

      const withArea = await patch(accessToken, { areaId: ALKAPURI_VADODARA });
      expect(withArea.body.data.profile.area).toMatchObject({ name: 'Alkapuri' });

      const dob = await patch(accessToken, { dateOfBirth: '1990-01-01' });
      expect(dob.status).toBe(400);
      expect(dob.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires a profile before updating', async () => {
      const { accessToken } = await loginMember(app, ip);

      const res = await patch(accessToken, { bio: 'Hello' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PROFILE_NOT_STARTED');
    });

    it('updates preferences and validates the age range against stored values', async () => {
      const { accessToken } = await loginMember(app, ip);
      await create(accessToken, validProfile());
      const put = (body: object) =>
        request(app).put('/api/v1/me/preferences').set(auth(accessToken)).send(body);

      const res = await put({
        preferredGender: 'men',
        minAge: 22,
        maxAge: 32,
        verifiedOnly: true,
        showArea: true,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.preferences).toMatchObject({
        preferredGender: 'men',
        minAge: 22,
        maxAge: 32,
        verifiedOnly: true,
        showArea: true,
      });

      const inverted = await put({ minAge: 40 }); // 40 > stored maxAge 32
      expect(inverted.status).toBe(400);
      expect((await put({ minAge: 16 })).status).toBe(400);
    });
  });

  describe('profile image', () => {
    it('stores an EXIF-free image, completes the profile and marks onboarding', async () => {
      const { accessToken, userId } = await loginMember(app, ip);
      await create(accessToken, validProfile());

      const res = await upload(
        accessToken,
        await makeImage({ width: 900, height: 1200, gps: true }),
      );

      expect(res.status).toBe(200);
      expect(res.body.data.profileStatus).toBe('complete');
      expect(res.body.data.completion.percentage).toBe(100);
      expect(res.body.data.profile.image).toEqual({
        url: 'https://media.test/card/test/profile-images/img1',
        thumbnailUrl: 'https://media.test/thumbnail/test/profile-images/img1',
      });
      const stored = media.stored.get('test/profile-images/img1');
      expect(stored).toBeDefined();
      expect((await sharp(stored).metadata()).exif).toBeUndefined();
      expect((await User.findByPk(userId))?.onboardingCompletedAt).not.toBeNull();
    });

    it('replaces the previous image and deletes it from storage', async () => {
      const { accessToken } = await loginMember(app, ip);
      await create(accessToken, validProfile());
      await upload(accessToken, await makeImage({ width: 600, height: 600 }));

      await upload(
        accessToken,
        await makeImage({ width: 700, height: 700, format: 'png' }),
        'image/png',
        'x.png',
      );

      expect(media.destroyed).toEqual(['test/profile-images/img1']);
      expect([...media.stored.keys()]).toEqual(['test/profile-images/img2']);
    });

    it('removing the photo makes the profile incomplete again', async () => {
      const { accessToken } = await loginMember(app, ip);
      await create(accessToken, validProfile());
      await upload(accessToken, await makeImage({ width: 600, height: 600 }));

      const res = await request(app).delete('/api/v1/me/profile/image').set(auth(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.profileStatus).toBe('incomplete');
      expect(media.destroyed).toEqual(['test/profile-images/img1']);
    });

    it('revokes the photo-verified badge when the photo changes', async () => {
      const { accessToken, userId } = await loginMember(app, ip);
      await create(accessToken, validProfile());
      await User.update({ photoVerifiedAt: new Date() }, { where: { id: userId } });
      await UserVerification.create({
        userId,
        type: 'photo',
        provider: 'internal_review',
        status: 'approved',
        decidedAt: new Date(),
      });

      const res = await upload(accessToken, await makeImage({ width: 600, height: 600 }));

      expect(res.body.data.photoVerified).toBe(false);
      expect((await UserVerification.findOne({ where: { userId } }))?.status).toBe('revoked');
    });

    it.each([
      [
        'a text file disguised as JPEG',
        () => Promise.resolve(Buffer.from('not an image')),
        'image/jpeg',
        400,
        'INVALID_IMAGE',
      ],
      [
        'a PDF',
        () => Promise.resolve(Buffer.from('%PDF-1.7')),
        'application/pdf',
        400,
        'INVALID_IMAGE',
      ],
      [
        'a GIF',
        () => makeImage({ width: 500, height: 500, format: 'gif' }),
        'image/jpeg',
        400,
        'INVALID_IMAGE',
      ],
      [
        'a too-small image',
        () => makeImage({ width: 300, height: 300 }),
        'image/jpeg',
        400,
        'INVALID_IMAGE',
      ],
      [
        'a file over 5 MB',
        () => Promise.resolve(Buffer.alloc(LIMITS.PROFILE_IMAGE_MAX_BYTES + 1, 1)),
        'image/png',
        413,
        'PAYLOAD_TOO_LARGE',
      ],
    ])('rejects %s', async (_label, makeFile, contentType, status, code) => {
      const { accessToken } = await loginMember(app, ip);
      await create(accessToken, validProfile());

      const res = await upload(accessToken, await makeFile(), contentType);

      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe(code);
      expect(media.stored.size).toBe(0);
    });

    it('rejects a request without a file', async () => {
      const { accessToken } = await loginMember(app, ip);
      await create(accessToken, validProfile());

      const res = await request(app).post('/api/v1/me/profile/image').set(auth(accessToken));

      expect(res.status).toBe(400);
    });

    it('requires a profile before uploading', async () => {
      const { accessToken } = await loginMember(app, ip);

      const res = await upload(accessToken, await makeImage({ width: 600, height: 600 }));

      expect(res.body.error.code).toBe('PROFILE_NOT_STARTED');
    });

    it('returns 503 and keeps the profile unchanged when storage fails', async () => {
      const { accessToken } = await loginMember(app, ip);
      await create(accessToken, validProfile());
      media.failNextUpload = true;

      const res = await upload(accessToken, await makeImage({ width: 600, height: 600 }));

      expect(res.status).toBe(503);
      expect((await getMine(accessToken)).body.data.profile.image).toBeNull();
    });
  });

  describe('public profile', () => {
    const PUBLIC_KEYS = [
      'age',
      'area',
      'availableDates',
      'bio',
      'city',
      'garbaLevel',
      'gender',
      'id',
      'image',
      'name',
      'photoVerified',
    ];

    it('shows only the public allow-list — never phone, date of birth, Instagram, preferences or status', async () => {
      const viewer = await completeMember();
      const target = await completeMember({ name: 'Rohan', gender: 'man' });

      const res = await request(app)
        .get(`/api/v1/users/${target.userId}/profile`)
        .set(auth(viewer.accessToken));

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(PUBLIC_KEYS);
      expect(res.body.data).toMatchObject({
        id: target.userId,
        name: 'Rohan',
        age: 26,
        area: null,
      });
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(target.phone);
      expect(serialized).not.toContain('priya.garba'); // Instagram handle
      expect(serialized).not.toContain(validProfile().dateOfBirth);
      expect(serialized).not.toMatch(/phone|dateOfBirth|instagram|preferences|accountStatus/i);
    });

    it('shows the area only when the member opted in', async () => {
      const viewer = await completeMember();
      const target = await completeMember();
      await UserPreference.update({ showArea: true }, { where: { userId: target.userId } });

      const res = await request(app)
        .get(`/api/v1/users/${target.userId}/profile`)
        .set(auth(viewer.accessToken));

      expect(res.body.data.area).toEqual({ id: NAVRANGPURA, name: 'Navrangpura' });
    });

    it('returns 404 for incomplete, suspended and unknown profiles alike', async () => {
      const viewer = await completeMember();
      const incomplete = await loginMember(app, ip);
      await create(incomplete.accessToken, validProfile());
      const suspended = await completeMember();
      await User.update({ status: 'suspended' }, { where: { id: suspended.userId } });

      for (const id of [incomplete.userId, suspended.userId, crypto.randomUUID()]) {
        const res = await request(app)
          .get(`/api/v1/users/${id}/profile`)
          .set(auth(viewer.accessToken));
        expect(res.status).toBe(404);
        expect(res.body.message).toBe('Profile not found.');
      }
    });

    it('requires an active, onboarded viewer', async () => {
      const target = await completeMember();
      const newcomer = await loginMember(app, ip);

      expect((await request(app).get(`/api/v1/users/${target.userId}/profile`)).status).toBe(401);
      const res = await request(app)
        .get(`/api/v1/users/${target.userId}/profile`)
        .set(auth(newcomer.accessToken));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ONBOARDING_REQUIRED');
    });

    it('lets suspended members edit their own profile but not view others', async () => {
      const target = await completeMember();
      const member = await completeMember();
      await User.update({ status: 'suspended' }, { where: { id: member.userId } });

      expect((await patch(member.accessToken, { bio: 'Updated' })).status).toBe(200);
      const res = await request(app)
        .get(`/api/v1/users/${target.userId}/profile`)
        .set(auth(member.accessToken));
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('previews the own public profile even before it is complete', async () => {
      const { accessToken } = await loginMember(app, ip);
      await create(accessToken, validProfile());

      const res = await request(app).get('/api/v1/me/profile/preview').set(auth(accessToken));

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(PUBLIC_KEYS);
      expect(res.body.data.image).toBeNull();
    });
  });
});
