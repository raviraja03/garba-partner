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
      expect(cities.body.data).toHaveLength(7);
      expect(cities.body.data[0]).toEqual({ id: AHMEDABAD, name: 'Ahmedabad', state: 'Gujarat' });
      // Jaipur was added after launch (migration 20261011100000-add-jaipur).
      const jaipur = (cities.body.data as { id: string; name: string; state: string }[]).find(
        (city) => city.name === 'Jaipur',
      );
      expect(jaipur).toEqual({
        id: 'c1000000-0000-4000-8000-000000000007',
        name: 'Jaipur',
        state: 'Rajasthan',
      });
      const jaipurAreas = await request(app).get(`/api/v1/cities/${jaipur?.id ?? ''}/areas`);
      expect((jaipurAreas.body.data as { name: string }[]).map((area) => area.name)).toEqual([
        'Malviya Nagar',
        'Vaishali Nagar',
        'Mansarovar',
        'C-Scheme',
        'Raja Park',
        'Jagatpura',
      ]);

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
        discoveryEnabled: true,
        showArea: true,
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

      const moved = await patch(accessToken, {
        cityId: VADODARA,
        bio: 'New bio',
        instagramId: '@New.Handle',
      });
      expect(moved.status).toBe(200);
      expect(moved.body.data.profile).toMatchObject({
        city: { id: VADODARA },
        area: null,
        bio: 'New bio',
        instagramId: 'new.handle',
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

    it('the only photo cannot be removed: a profile always keeps at least one', async () => {
      const { accessToken } = await loginMember(app, ip);
      await create(accessToken, validProfile());
      await upload(accessToken, await makeImage({ width: 600, height: 600 }));

      const res = await request(app).delete('/api/v1/me/profile/image').set(auth(accessToken));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'Your profile needs at least one photo. Upload a new photo to replace this one.',
      );
      const mine = (await getMine(accessToken)).body.data;
      expect(mine.profileStatus).toBe('complete');
      expect(mine.profile.image).not.toBeNull();
      expect(media.destroyed).toEqual([]);
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
        verifiedAt: new Date(),
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

  describe('required details', () => {
    it('a profile cannot be created without a bio, an Instagram username, a date, a city or a gender', async () => {
      const { accessToken } = await loginMember(app, ip);
      const cases: [Record<string, unknown>, string, string][] = [
        [{ bio: '' }, 'bio', 'Tell other members a little about yourself.'],
        [{ bio: '   ' }, 'bio', 'Tell other members a little about yourself.'],
        [{ bio: undefined }, 'bio', ''],
        [{ instagramId: '' }, 'instagramId', 'Enter your Instagram username.'],
        [{ instagramId: '@' }, 'instagramId', 'Enter your Instagram username.'],
        [{ instagramId: undefined }, 'instagramId', ''],
        [{ availableDates: [] }, 'availableDates', "Add at least one date you're free for Garba."],
        [{ availableDates: undefined }, 'availableDates', ''],
        [{ cityId: undefined }, 'cityId', ''],
        [{ cityId: '' }, 'cityId', 'Choose a city.'],
        [{ gender: undefined }, 'gender', 'Choose your gender.'],
        [{ gender: '' }, 'gender', 'Choose your gender.'],
      ];
      for (const [overrides, path, message] of cases) {
        const res = await create(accessToken, validProfile(overrides));
        expect(res.status, JSON.stringify(overrides)).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        const issue = (res.body.error.details as { path: string; message: string }[]).find(
          (detail) => detail.path === path,
        );
        expect(issue, JSON.stringify(overrides)).toBeDefined();
        if (message) expect(issue?.message).toBe(message);
      }
      expect((await getMine(accessToken)).body.data.profile).toBeNull();
    });

    it('an existing profile cannot have them cleared, and other edits do not need them resent', async () => {
      const { accessToken } = await loginMember(app, ip);
      await create(accessToken, validProfile());

      for (const body of [
        { bio: '' },
        { bio: null },
        { instagramId: '' },
        { instagramId: null },
        { availableDates: [] },
        { cityId: null },
        { gender: null },
      ]) {
        const res = await patch(accessToken, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      const unchanged = (await getMine(accessToken)).body.data.profile;
      expect(unchanged).toMatchObject({ bio: 'Dancing since school.', instagramId: 'priya.garba' });
      expect(unchanged.availableDates).toHaveLength(2);

      // A partial update that does not mention them is still fine.
      expect((await patch(accessToken, { garbaLevel: 'beginner' })).status).toBe(200);
    });
  });

  describe('extra photos', () => {
    const addPhoto = async (token: string, size = 600) =>
      request(app)
        .post('/api/v1/me/profile/photos')
        .set(auth(token))
        .attach('image', await makeImage({ width: size, height: size }), {
          filename: 'more.jpg',
          contentType: 'image/jpeg',
        });
    const deletePhoto = (token: string, photoId: string) =>
      request(app).delete(`/api/v1/me/profile/photos/${photoId}`).set(auth(token));

    it('adds extra photos next to the main one, oldest first, up to the limit', async () => {
      const { accessToken } = await completeMember();

      for (let i = 0; i < LIMITS.PROFILE_EXTRA_PHOTOS_MAX; i += 1) {
        const res = await addPhoto(accessToken);
        expect(res.status).toBe(201);
        expect(res.body.data.profile.photos).toHaveLength(i + 1);
      }
      const { profile } = (await getMine(accessToken)).body.data;
      expect(profile.image.url).toContain('img1'); // the main photo did not change
      expect(profile.photos.map((photo: { url: string }) => photo.url)).toEqual(
        [2, 3, 4, 5, 6].map((n) => `https://media.test/card/test/profile-images/img${String(n)}`),
      );
      expect(profile.photos[0]).toEqual({
        id: expect.any(String),
        url: expect.any(String),
        thumbnailUrl: 'https://media.test/thumbnail/test/profile-images/img2',
      });

      const tooMany = await addPhoto(accessToken);
      expect(tooMany.status).toBe(400);
      expect(tooMany.body.message).toBe('You can add up to 5 extra photos. Remove one first.');
      expect((await getMine(accessToken)).body.data.profile.photos).toHaveLength(5);
    });

    it('the first photo of a profile becomes its main photo', async () => {
      const { accessToken } = await loginMember(app, ip);
      await create(accessToken, validProfile());

      const res = await addPhoto(accessToken);

      expect(res.status).toBe(201);
      expect(res.body.data.profile.image).not.toBeNull();
      expect(res.body.data.profile.photos).toEqual([]);
      expect(res.body.data.profileStatus).toBe('complete');
    });

    it('validates extra photos like the main one and needs a profile', async () => {
      const { accessToken } = await completeMember();
      expect((await addPhoto(accessToken, 200)).status).toBe(400); // too small
      const noFile = await request(app).post('/api/v1/me/profile/photos').set(auth(accessToken));
      expect(noFile.status).toBe(400);
      const notAnImage = await request(app)
        .post('/api/v1/me/profile/photos')
        .set(auth(accessToken))
        .attach('image', Buffer.from('<html>not an image</html>'), {
          filename: 'x.jpg',
          contentType: 'image/jpeg',
        });
      expect(notAnImage.status).toBe(400);
      expect((await getMine(accessToken)).body.data.profile.photos).toEqual([]);

      const fresh = await loginMember(app, uniqueIp());
      expect((await addPhoto(fresh.accessToken)).status).toBe(409); // PROFILE_NOT_STARTED
      expect((await request(app).post('/api/v1/me/profile/photos')).status).toBe(401);
    });

    it('removes an extra photo from the profile and from storage', async () => {
      const { accessToken } = await completeMember();
      const added = (await addPhoto(accessToken)).body.data.profile.photos as { id: string }[];
      await addPhoto(accessToken);

      const res = await deletePhoto(accessToken, added[0]?.id ?? '');

      expect(res.status).toBe(200);
      expect(res.body.data.profile.photos).toHaveLength(1);
      expect(res.body.data.profile.photos[0].url).toContain('img3');
      expect(media.destroyed).toEqual(['test/profile-images/img2']);
      // Gone means gone.
      expect((await deletePhoto(accessToken, added[0]?.id ?? '')).status).toBe(404);
      expect((await deletePhoto(accessToken, 'not-a-uuid')).status).toBe(400);
    });

    it('a member cannot remove another member’s photo', async () => {
      const owner = await completeMember();
      const [photo] = (await addPhoto(owner.accessToken)).body.data.profile.photos as {
        id: string;
      }[];
      ip = uniqueIp();
      const other = await completeMember({ name: 'Mallory' });

      const res = await deletePhoto(other.accessToken, photo?.id ?? '');

      expect(res.status).toBe(404);
      expect((await getMine(owner.accessToken)).body.data.profile.photos).toHaveLength(1);
      expect(media.destroyed).toEqual([]);
    });

    it('removing the main photo promotes the oldest extra photo and resets photo verification', async () => {
      const { accessToken, userId } = await completeMember();
      await addPhoto(accessToken);
      await addPhoto(accessToken);
      await User.update({ photoVerifiedAt: new Date() }, { where: { id: userId } });

      const res = await request(app).delete('/api/v1/me/profile/image').set(auth(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.profileStatus).toBe('complete');
      expect(res.body.data.profile.image.url).toContain('img2');
      expect(res.body.data.profile.photos).toHaveLength(1);
      expect(res.body.data.profile.photos[0].url).toContain('img3');
      expect(res.body.data.photoVerified).toBe(false);
      expect(media.destroyed).toEqual(['test/profile-images/img1']);
    });

    it('other members see the extra photos on the profile page, never in the storage form', async () => {
      const owner = await completeMember();
      await request(app)
        .put('/api/v1/me/preferences')
        .set(auth(owner.accessToken))
        .send({ discoveryEnabled: true });
      await addPhoto(owner.accessToken);
      ip = uniqueIp();
      const viewer = await completeMember({ name: 'Viewer' });

      const res = await request(app)
        .get(`/api/v1/users/${owner.userId}/profile`)
        .set(auth(viewer.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.photos).toEqual([
        {
          id: expect.any(String),
          url: 'https://media.test/card/test/profile-images/img2',
          thumbnailUrl: 'https://media.test/thumbnail/test/profile-images/img2',
        },
      ]);
      const preview = await request(app)
        .get('/api/v1/me/profile/preview')
        .set(auth(owner.accessToken));
      expect(preview.body.data.photos).toHaveLength(1);
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
      'identityVerified',
      'image',
      'name',
      'phoneVerified',
      'photoVerified',
      'photos',
    ];

    /** Public profiles follow discovery visibility, which is opt-in (QA finding SEC-01). */
    const discoverable = (userId: string, extra: Record<string, unknown> = {}) =>
      UserPreference.update({ discoveryEnabled: true, ...extra }, { where: { userId } });

    it('new members are visible by default, and hidden once they pause discovery', async () => {
      const viewer = await completeMember();
      const target = await completeMember();
      const view = () =>
        request(app).get(`/api/v1/users/${target.userId}/profile`).set(auth(viewer.accessToken));
      expect((await view()).status).toBe(200);
      await request(app)
        .put('/api/v1/me/preferences')
        .set(auth(target.accessToken))
        .send({ discoveryEnabled: false })
        .expect(200);
      expect((await view()).status).toBe(404);
      await discoverable(target.userId);
      expect((await view()).status).toBe(200);
    });

    it('shows only the public allow-list — never phone, date of birth, Instagram, preferences or status', async () => {
      const viewer = await completeMember();
      const target = await completeMember({ name: 'Rohan', gender: 'man' });
      await discoverable(target.userId);

      const res = await request(app)
        .get(`/api/v1/users/${target.userId}/profile`)
        .set(auth(viewer.accessToken));

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(PUBLIC_KEYS);
      expect(res.body.data).toMatchObject({
        id: target.userId,
        name: 'Rohan',
        age: 26,
        // The neighbourhood is shown by default (the member can hide it).
        area: { name: 'Navrangpura' },
      });
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(target.phone);
      expect(serialized).not.toContain('priya.garba'); // Instagram handle
      expect(serialized).not.toContain(validProfile().dateOfBirth);
      // `phoneVerified: true` is a badge (every member signs in by OTP), not phone data.
      expect(serialized.replace('"phoneVerified":true', '')).not.toMatch(
        /phone|dateOfBirth|instagram|preferences|accountStatus/i,
      );
    });

    it('shows the area only when the member opted in', async () => {
      const viewer = await completeMember();
      const target = await completeMember();
      await discoverable(target.userId, { showArea: true });

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
