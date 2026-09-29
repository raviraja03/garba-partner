import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PartnerDto } from '@garba-partner/shared';
import { Block, Report, User } from '../../models/index.js';
import {
  VADODARA,
  bearer,
  createEvent,
  createOrganizer,
  publishEvent,
} from '../../test/event-fixtures.js';
import {
  createTestApp,
  hasTestDatabase,
  loginAdmin,
  loginMember,
  uniqueIp,
  useTestDatabase,
} from '../../test/helpers.js';
import {
  createMember,
  dobForAge,
  upcoming,
  type MemberOptions,
} from '../../test/member-fixtures.js';

const PUBLIC_PROFILE_KEYS = [
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
];

describe.skipIf(!hasTestDatabase)('partner discovery (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let ip: string;

  beforeEach(() => {
    app = createTestApp({ sequelize: db() });
    ip = uniqueIp();
  });

  /** The viewer: a 25-year-old woman looking for men aged 22–35. */
  const viewerOptions: MemberOptions = {
    name: 'Viewer',
    gender: 'woman',
    age: 25,
    preferredGender: 'men',
    minAge: 22,
    maxAge: 35,
  };
  const member = (options: MemberOptions = {}) => createMember(app, options);

  const partners = (token: string, query = '') =>
    request(app).get(`/api/v1/partners${query}`).set(bearer(token));
  const ids = (res: request.Response) =>
    (res.body.data as PartnerDto[]).map((partner) => partner.profile.id);

  describe('access', () => {
    it('requires an active, onboarded member', async () => {
      expect((await request(app).get('/api/v1/partners')).status).toBe(401);

      const noProfile = await loginMember(app, ip);
      const res = await partners(noProfile.accessToken);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ONBOARDING_REQUIRED');

      const suspended = await member(viewerOptions);
      await User.update({ status: 'suspended' }, { where: { id: suspended.userId } });
      expect((await partners(suspended.accessToken)).status).toBe(403);
    });

    it('rejects invalid filters', async () => {
      const viewer = await member(viewerOptions);
      for (const query of [
        '?minAge=17',
        '?minAge=30&maxAge=25',
        '?garbaLevels=expert',
        '?date=2026-02-30',
        '?cityId=nope',
        '?cursor=garbage',
        '?sort=score',
        '?score=1',
      ]) {
        expect((await partners(viewer.accessToken, query)).status, query).toBe(400);
      }
    });
  });

  describe('eligibility', () => {
    it('shows only eligible members and excludes everyone the rules exclude', async () => {
      const viewer = await member(viewerOptions);
      const eligible = await member({ name: 'Eligible', age: 27 });

      const excluded = {
        discoveryOff: await member({ discoveryEnabled: false }),
        noPhoto: await member({ photo: false }),
        wrongGender: await member({ gender: 'woman' }),
        wantsOnlyMen: await member({ preferredGender: 'men' }),
        tooOld: await member({ age: 45 }),
        viewerTooYoung: await member({ minAge: 30, maxAge: 40 }),
        suspended: await member(),
        banned: await member(),
        hidden: await member(),
        deleted: await member(),
        blockedByViewer: await member(),
        blockedViewer: await member(),
        reportedByViewer: await member(),
      };
      await User.update({ status: 'suspended' }, { where: { id: excluded.suspended.userId } });
      await User.update({ status: 'banned' }, { where: { id: excluded.banned.userId } });
      await User.update(
        { hiddenFromDiscovery: true, hiddenReason: 'p0_report' },
        { where: { id: excluded.hidden.userId } },
      );
      // Soft delete as the erasure flow does it: phone data is removed in the same UPDATE.
      await db().query(
        `UPDATE users SET deleted_at = now(), phone_hash = NULL, phone_encrypted = NULL,
           phone_key_version = NULL WHERE id = :id`,
        { replacements: { id: excluded.deleted.userId } },
      );
      await Block.create({ blockerId: viewer.userId, blockedId: excluded.blockedByViewer.userId });
      await Block.create({ blockerId: excluded.blockedViewer.userId, blockedId: viewer.userId });
      await Report.create({
        reporterId: viewer.userId,
        reportedUserId: excluded.reportedByViewer.userId,
        reason: 'fake_profile',
        priority: 2,
      });

      const res = await partners(viewer.accessToken);
      expect(res.status).toBe(200);
      expect(ids(res)).toEqual([eligible.userId]);
      expect(res.headers['cache-control']).toBe('private, no-store');

      // The same rules apply to the partner profile endpoint.
      for (const other of Object.values(excluded)) {
        const detail = await request(app)
          .get(`/api/v1/partners/${other.userId}`)
          .set(bearer(viewer.accessToken));
        expect(detail.status).toBe(404);
      }
      const self = await request(app)
        .get(`/api/v1/partners/${viewer.userId}`)
        .set(bearer(viewer.accessToken));
      expect(self.status).toBe(404);
    });

    it('never lists the viewer to someone the viewer does not fit (mutual preferences)', async () => {
      const viewer = await member(viewerOptions);
      const candidate = await member({ age: 27, preferredGender: 'women', minAge: 18, maxAge: 30 });
      expect(ids(await partners(viewer.accessToken))).toEqual([candidate.userId]);
      // And the other way round: the candidate sees the viewer.
      expect(ids(await partners(candidate.accessToken))).toEqual([viewer.userId]);
    });

    it('hides blocked members from the public profile endpoint as well', async () => {
      const viewer = await member(viewerOptions);
      const other = await member();
      await Block.create({ blockerId: other.userId, blockedId: viewer.userId });
      const res = await request(app)
        .get(`/api/v1/users/${other.userId}/profile`)
        .set(bearer(viewer.accessToken));
      expect(res.status).toBe(404);
    });
  });

  describe('privacy', () => {
    it('returns the public allow-list only, with highlights and never a score', async () => {
      const viewer = await member(viewerOptions);
      const candidate = await member({ instagramId: 'secret.handle', age: 27 });

      const res = await partners(viewer.accessToken);
      const [partner] = res.body.data as PartnerDto[];
      expect(Object.keys(partner ?? {}).sort()).toEqual([
        'connection',
        'highlights',
        'profile',
        'sharedDates',
        'sharedEvents',
      ]);
      expect(partner?.connection).toEqual({ status: 'none', interestId: null, matchId: null });
      expect(Object.keys(partner?.profile ?? {}).sort()).toEqual(PUBLIC_PROFILE_KEYS);
      expect(partner?.profile.area).toBeNull();

      const detail = await request(app)
        .get(`/api/v1/partners/${candidate.userId}`)
        .set(bearer(viewer.accessToken));
      for (const body of [res.body, detail.body]) {
        const serialized = JSON.stringify(body);
        expect(serialized).not.toContain(candidate.phone);
        expect(serialized).not.toContain('secret.handle');
        expect(serialized).not.toContain(dobForAge(27));
        // (`connection.status` is the viewer's own relationship, not the member's account status.)
        expect(serialized).not.toMatch(
          /score|dateOfBirth|instagram|preferences|lastActive|accountStatus|hidden|restricted/i,
        );
      }
    });
  });

  describe('ranking', () => {
    it('orders by shared event, shared date, city, age, level and verification', async () => {
      const date = upcoming(4);
      const viewer = await member({
        ...viewerOptions,
        garbaLevel: 'intermediate',
        availableDates: [date],
      });

      const { accessToken: adminToken } = await loginAdmin(app, ip, 'event_manager');
      const organizer = await createOrganizer(app, adminToken);
      const event = await createEvent(app, adminToken, organizer.id);
      await publishEvent(app, adminToken, event.id);

      const plain = await member({ cityId: VADODARA, age: 34 }); // 0
      const verified = await member({ cityId: VADODARA, age: 34 }); // 5
      await User.update({ photoVerifiedAt: new Date() }, { where: { id: verified.userId } });
      const sameCity = await member({ age: 34 }); // 20
      const sharedDate = await member({ cityId: VADODARA, age: 34, availableDates: [date] }); // 25
      const sameEvent = await member({ cityId: VADODARA, age: 34 }); // 30

      for (const m of [viewer, sameEvent]) {
        await request(app)
          .put(`/api/v1/events/${event.id}/attendance`)
          .set(bearer(m.accessToken))
          .send({ status: 'going', lookingForPartner: true })
          .expect(200);
      }

      const res = await partners(viewer.accessToken);
      expect(ids(res)).toEqual([
        sameEvent.userId,
        sharedDate.userId,
        sameCity.userId,
        verified.userId,
        plain.userId,
      ]);
      const byId = new Map((res.body.data as PartnerDto[]).map((p) => [p.profile.id, p]));
      expect(byId.get(sameEvent.userId)?.highlights).toEqual(['same_event']);
      expect(byId.get(sameEvent.userId)?.sharedEvents).toEqual([
        { id: event.id, slug: event.slug, name: event.name, eventDate: event.eventDate },
      ]);
      expect(byId.get(sharedDate.userId)).toMatchObject({
        highlights: ['shared_dates'],
        sharedDates: [date],
        sharedEvents: [],
      });
      expect(byId.get(sameCity.userId)?.highlights).toEqual(['same_city']);
      expect(byId.get(verified.userId)?.highlights).toEqual(['verified']);
      expect(byId.get(plain.userId)?.highlights).toEqual([]);

      // Similar age (10) + same level (10) = 20: ties with "same city", after "shared date" (25)
      // and before "verified" (5). Ties are broken by activity day, then ID.
      const close = await member({ cityId: VADODARA, age: 26, garbaLevel: 'intermediate' });
      const again = await partners(viewer.accessToken);
      expect([2, 3]).toContain(ids(again).indexOf(close.userId));
      expect(ids(again).slice(0, 2)).toEqual([sameEvent.userId, sharedDate.userId]);
      expect(ids(again).slice(4)).toEqual([verified.userId, plain.userId]);
      expect(
        (again.body.data as PartnerDto[]).find((p) => p.profile.id === close.userId)?.highlights,
      ).toEqual(['similar_age', 'same_level']);
    });
  });

  describe('filters', () => {
    it('filters by city, level, date, age and verification — never widening preferences', async () => {
      const date = upcoming(6);
      const viewer = await member(viewerOptions);
      const vadodara = await member({ cityId: VADODARA, garbaLevel: 'advanced', age: 30 });
      const available = await member({ availableDates: [date], age: 23 });
      const verified = await member({ age: 33 });
      await User.update({ identityVerifiedAt: new Date() }, { where: { id: verified.userId } });
      await member({ age: 50 }); // outside the saved range: never shown

      const token = viewer.accessToken;
      expect(ids(await partners(token, `?cityId=${VADODARA}`))).toEqual([vadodara.userId]);
      expect(ids(await partners(token, '?garbaLevels=advanced,intermediate'))).toEqual([
        vadodara.userId,
      ]);
      expect(ids(await partners(token, `?date=${date}`))).toEqual([available.userId]);
      expect(new Set(ids(await partners(token, '?minAge=29&maxAge=31')))).toEqual(
        new Set([vadodara.userId]),
      );
      expect(ids(await partners(token, '?verifiedOnly=true'))).toEqual([verified.userId]);
      // maxAge=80 cannot widen the saved 22–35 range.
      expect(ids(await partners(token, '?minAge=18&maxAge=80'))).toHaveLength(3);
      // A narrowed range outside the saved one yields nothing.
      expect(ids(await partners(token, '?minAge=40&maxAge=60'))).toEqual([]);

      // The saved "verified only" preference applies by default.
      await request(app)
        .put('/api/v1/me/preferences')
        .set(bearer(token))
        .send({ verifiedOnly: true })
        .expect(200);
      expect(ids(await partners(token))).toEqual([verified.userId]);
      expect(ids(await partners(token, '?verifiedOnly=false'))).toHaveLength(3);
    });

    it('event mode is reciprocal and limited to members looking at that event', async () => {
      const viewer = await member(viewerOptions);
      const { accessToken: adminToken } = await loginAdmin(app, ip, 'event_manager');
      const organizer = await createOrganizer(app, adminToken);
      const event = await createEvent(app, adminToken, organizer.id);
      const draft = await createEvent(app, adminToken, organizer.id);
      await publishEvent(app, adminToken, event.id);

      const looking = await member();
      const goingOnly = await member();
      await member(); // not attending
      const setAttendance = (token: string, lookingForPartner: boolean) =>
        request(app)
          .put(`/api/v1/events/${event.id}/attendance`)
          .set(bearer(token))
          .send({ status: 'going', lookingForPartner })
          .expect(200);
      await setAttendance(looking.accessToken, true);
      await setAttendance(goingOnly.accessToken, false);

      const blocked = await partners(viewer.accessToken, `?eventId=${event.id}`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('PARTNER_TOGGLE_REQUIRED');

      await setAttendance(viewer.accessToken, true);
      const res = await partners(viewer.accessToken, `?eventId=${event.id}`);
      expect(ids(res)).toEqual([looking.userId]);

      expect((await partners(viewer.accessToken, `?eventId=${draft.id}`)).status).toBe(404);
    });
  });

  describe('pagination', () => {
    it('pages through every candidate exactly once', async () => {
      const viewer = await member(viewerOptions);
      const created = [];
      for (let i = 0; i < 5; i += 1) created.push((await member({ age: 24 + i })).userId);

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query = `?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
        const res = await partners(viewer.accessToken, query);
        expect(res.status).toBe(200);
        seen.push(...ids(res));
        cursor = (res.body.meta as { nextCursor: string | null }).nextCursor;
        pages += 1;
      } while (cursor && pages < 10);

      expect(pages).toBe(3);
      expect(seen).toHaveLength(5);
      expect(new Set(seen)).toEqual(new Set(created));
    });
  });
});
