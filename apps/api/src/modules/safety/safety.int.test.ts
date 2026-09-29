import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PartnerDto } from '@garba-partner/shared';
import { Block, Report, SafetyLog, User } from '../../models/index.js';
import { bearer } from '../../test/event-fixtures.js';
import { createTestApp, hasTestDatabase, useTestDatabase } from '../../test/helpers.js';
import { createMember } from '../../test/member-fixtures.js';

describe.skipIf(!hasTestDatabase)('blocking and reporting (integration)', () => {
  const db = useTestDatabase();
  let app: Express;

  beforeEach(() => {
    app = createTestApp({ sequelize: db() });
  });

  const partnerIds = async (token: string) =>
    ((await request(app).get('/api/v1/partners').set(bearer(token))).body.data as PartnerDto[]).map(
      (partner) => partner.profile.id,
    );

  describe('blocking', () => {
    it('blocks silently, removes both members from each other’s discovery, and unblocks', async () => {
      const a = await createMember(app, { name: 'Asha' });
      const b = await createMember(app, { name: 'Bhavin' });
      expect(await partnerIds(a.accessToken)).toEqual([b.userId]);

      const blocked = await request(app)
        .post('/api/v1/blocks')
        .set(bearer(a.accessToken))
        .send({ userId: b.userId });
      expect(blocked.status).toBe(201);
      const again = await request(app)
        .post('/api/v1/blocks')
        .set(bearer(a.accessToken))
        .send({ userId: b.userId });
      expect(again.status).toBe(200);

      expect(await partnerIds(a.accessToken)).toEqual([]);
      expect(await partnerIds(b.accessToken)).toEqual([]);
      expect(await SafetyLog.count({ where: { eventType: 'safety.block_created' } })).toBe(1);

      const list = await request(app).get('/api/v1/blocks').set(bearer(a.accessToken));
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ userId: b.userId, name: 'Bhavin' });
      // The blocked member's list is empty: blocks are never revealed to them.
      expect(
        (await request(app).get('/api/v1/blocks').set(bearer(b.accessToken))).body.data,
      ).toEqual([]);

      await request(app)
        .delete(`/api/v1/blocks/${b.userId}`)
        .set(bearer(a.accessToken))
        .expect(200);
      expect(await partnerIds(a.accessToken)).toEqual([b.userId]);
    });

    it('rejects self-blocks, unknown members and bad input', async () => {
      const a = await createMember(app);
      const auth = bearer(a.accessToken);
      expect(
        (await request(app).post('/api/v1/blocks').set(auth).send({ userId: a.userId })).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post('/api/v1/blocks')
            .set(auth)
            .send({ userId: '0e4b0c1a-5555-4000-8000-000000000000' })
        ).status,
      ).toBe(404);
      expect((await request(app).post('/api/v1/blocks').set(auth).send({})).status).toBe(400);
      expect((await request(app).post('/api/v1/blocks').send({ userId: a.userId })).status).toBe(
        401,
      );
    });

    it('still lets a suspended member block (protecting yourself is always possible)', async () => {
      const a = await createMember(app);
      const b = await createMember(app);
      await User.update({ status: 'suspended' }, { where: { id: a.userId } });
      const res = await request(app)
        .post('/api/v1/blocks')
        .set(bearer(a.accessToken))
        .send({ userId: b.userId });
      expect(res.status).toBe(201);
    });
  });

  describe('reporting', () => {
    it('creates a report, blocks by default, merges duplicates and excludes the member', async () => {
      const reporter = await createMember(app);
      const reported = await createMember(app);
      const auth = bearer(reporter.accessToken);

      const res = await request(app)
        .post('/api/v1/reports')
        .set(auth)
        .send({ reportedUserId: reported.userId, reason: 'harassment', details: 'Rude messages.' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ alreadyReported: false, blocked: true });
      expect(await Block.count({ where: { blockerId: reporter.userId } })).toBe(1);

      const duplicate = await request(app)
        .post('/api/v1/reports')
        .set(auth)
        .send({ reportedUserId: reported.userId, reason: 'harassment' });
      expect(duplicate.status).toBe(200);
      expect(duplicate.body.data.alreadyReported).toBe(true);
      expect(await Report.count()).toBe(1);

      expect(await partnerIds(reporter.accessToken)).toEqual([]);
    });

    it('excludes reported members even without a block', async () => {
      const reporter = await createMember(app);
      const reported = await createMember(app);
      await request(app)
        .post('/api/v1/reports')
        .set(bearer(reporter.accessToken))
        .send({ reportedUserId: reported.userId, reason: 'fake_profile', alsoBlock: false })
        .expect(201);
      expect(await Block.count()).toBe(0);
      expect(await partnerIds(reporter.accessToken)).toEqual([]);
    });

    it('hides a member from everyone after a P0 report, pending review', async () => {
      const reporter = await createMember(app);
      const reported = await createMember(app);
      const bystander = await createMember(app);
      expect(await partnerIds(bystander.accessToken)).toContain(reported.userId);

      await request(app)
        .post('/api/v1/reports')
        .set(bearer(reporter.accessToken))
        .send({ reportedUserId: reported.userId, reason: 'safety_threat' })
        .expect(201);

      const user = await User.findByPk(reported.userId);
      expect(user?.hiddenFromDiscovery).toBe(true);
      expect(await partnerIds(bystander.accessToken)).not.toContain(reported.userId);
      expect(await SafetyLog.count({ where: { eventType: 'safety.auto_hidden' } })).toBe(1);
    });

    it('validates reports', async () => {
      const reporter = await createMember(app);
      const auth = bearer(reporter.accessToken);
      for (const body of [
        { reportedUserId: reporter.userId, reason: 'harassment' },
        { reportedUserId: '0e4b0c1a-5555-4000-8000-000000000000', reason: 'harassment' },
        { reportedUserId: reporter.userId, reason: 'not-a-reason' },
        { reason: 'harassment' },
      ]) {
        const res = await request(app).post('/api/v1/reports').set(auth).send(body);
        expect([400, 404]).toContain(res.status);
      }
    });
  });
});
