import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { User } from '../../models/index.js';
import { bearer, createEvent, createOrganizer, publishEvent } from '../../test/event-fixtures.js';
import {
  createTestApp,
  hasTestDatabase,
  loginAdmin,
  uniqueIp,
  useTestDatabase,
} from '../../test/helpers.js';
import { createMember } from '../../test/member-fixtures.js';

describe.skipIf(!hasTestDatabase)('event attendance (integration)', () => {
  const db = useTestDatabase();
  let app: Express;
  let ip: string;
  let adminToken: string;
  let organizerId: string;

  beforeEach(async () => {
    app = createTestApp({ sequelize: db() });
    ip = uniqueIp();
    adminToken = (await loginAdmin(app, ip, 'event_manager')).accessToken;
    organizerId = (await createOrganizer(app, adminToken)).id;
  });

  async function publishedEvent() {
    const event = await createEvent(app, adminToken, organizerId);
    await publishEvent(app, adminToken, event.id);
    return event;
  }

  const attendance = (eventId: string) => `/api/v1/events/${eventId}/attendance`;

  it('sets, reads, updates and clears the member’s own attendance', async () => {
    const member = await createMember(app);
    const event = await publishedEvent();
    const auth = bearer(member.accessToken);

    expect((await request(app).get(attendance(event.id)).set(auth)).body.data).toBeNull();

    const set = await request(app)
      .put(attendance(event.id))
      .set(auth)
      .send({ status: 'going', lookingForPartner: true });
    expect(set.status).toBe(200);
    expect(set.body.data).toMatchObject({
      eventId: event.id,
      status: 'going',
      lookingForPartner: true,
    });

    const update = await request(app)
      .put(attendance(event.id))
      .set(auth)
      .send({ status: 'interested', lookingForPartner: false });
    expect(update.body.data).toMatchObject({ status: 'interested', lookingForPartner: false });

    const mine = await request(app).get('/api/v1/me/attendance').set(auth);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].event).toMatchObject({ id: event.id, slug: event.slug });

    await request(app).delete(attendance(event.id)).set(auth).expect(200);
    expect((await request(app).get(attendance(event.id)).set(auth)).body.data).toBeNull();
  });

  it('only allows published events that have not ended', async () => {
    const member = await createMember(app);
    const auth = bearer(member.accessToken);
    const draft = await createEvent(app, adminToken, organizerId);
    const body = { status: 'going', lookingForPartner: true };

    expect((await request(app).put(attendance(draft.id)).set(auth).send(body)).status).toBe(404);

    const ended = await publishedEvent();
    await db().query('UPDATE events SET event_date = event_date - 30 WHERE id = :id', {
      replacements: { id: ended.id },
    });
    const res = await request(app).put(attendance(ended.id)).set(auth).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVENT_NOT_OPEN');
  });

  it('validates input and requires an active, onboarded member', async () => {
    const event = await publishedEvent();
    expect((await request(app).put(attendance(event.id)).send({ status: 'going' })).status).toBe(
      401,
    );

    const member = await createMember(app);
    const auth = bearer(member.accessToken);
    for (const body of [
      { status: 'maybe', lookingForPartner: true },
      { status: 'going' },
      { status: 'going', lookingForPartner: true, userId: member.userId },
    ]) {
      expect((await request(app).put(attendance(event.id)).set(auth).send(body)).status).toBe(400);
    }

    await User.update({ status: 'suspended' }, { where: { id: member.userId } });
    const suspended = await request(app)
      .put(attendance(event.id))
      .set(auth)
      .send({ status: 'going', lookingForPartner: true });
    expect(suspended.status).toBe(403);
  });

  it('never exposes attendance on public event pages', async () => {
    const event = await publishedEvent();
    const member = await createMember(app);
    await request(app)
      .put(attendance(event.id))
      .set(bearer(member.accessToken))
      .send({ status: 'going', lookingForPartner: true })
      .expect(200);

    const detail = await request(app).get(`/api/v1/events/${event.id}`);
    expect(JSON.stringify(detail.body)).not.toContain(member.userId);
    expect(JSON.stringify(detail.body)).not.toMatch(/attend|looking/i);
  });
});
