import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatSummaryDto, MessageDto } from '@garba-partner/shared';
import { Match, Message, Report, User } from '../../models/index.js';
import { bearer } from '../../test/event-fixtures.js';
import { createTestApp, hasTestDatabase, useTestDatabase } from '../../test/helpers.js';
import { createMatchedPair, createMember, type TestMember } from '../../test/member-fixtures.js';

describe.skipIf(!hasTestDatabase)('chat REST API (integration)', () => {
  const db = useTestDatabase();
  let app: Express;

  beforeEach(() => {
    app = createTestApp({ sequelize: db() });
  });

  const send = (m: TestMember, matchId: string, body: string, clientMessageId = randomUUID()) =>
    request(app)
      .post(`/api/v1/chats/${matchId}/messages`)
      .set(bearer(m.accessToken))
      .send({ clientMessageId, body });
  const history = (m: TestMember, matchId: string, query = '') =>
    request(app).get(`/api/v1/chats/${matchId}/messages${query}`).set(bearer(m.accessToken));
  const chats = async (m: TestMember) =>
    (await request(app).get('/api/v1/chats').set(bearer(m.accessToken))).body
      .data as ChatSummaryDto[];
  const unread = async (m: TestMember) =>
    (await request(app).get('/api/v1/chats/unread').set(bearer(m.accessToken))).body.data
      .total as number;

  describe('sending and history', () => {
    it('sends, lists newest first with timestamps, and pages older messages', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      const sent: MessageDto[] = [];
      for (const [who, body] of [
        [a, 'Hi! Going to Rangtaali?'],
        [b, 'Yes, Saturday!'],
        [a, 'Great, see you at the gate.'],
      ] as const) {
        const res = await send(who, matchId, body);
        expect(res.status).toBe(201);
        sent.push(res.body.data as MessageDto);
      }
      expect(sent[0]).toMatchObject({
        matchId,
        senderId: a.userId,
        body: 'Hi! Going to Rangtaali?',
      });
      expect(Date.parse(sent[0]?.createdAt ?? '')).not.toBeNaN();

      const page1 = await history(b, matchId, '?limit=2');
      expect((page1.body.data as MessageDto[]).map((m) => m.body)).toEqual([
        'Great, see you at the gate.',
        'Yes, Saturday!',
      ]);
      const page2 = await history(
        b,
        matchId,
        `?limit=2&cursor=${String(page1.body.meta.nextCursor)}`,
      );
      expect((page2.body.data as MessageDto[]).map((m) => m.body)).toEqual([
        'Hi! Going to Rangtaali?',
      ]);
      expect(page2.body.meta.nextCursor).toBeNull();
      expect(page1.headers['cache-control']).toBe('private, no-store');
    });

    it('is idempotent on clientMessageId', async () => {
      const { a, matchId } = await createMatchedPair(app);
      const id = randomUUID();
      expect((await send(a, matchId, 'Hello', id)).status).toBe(201);
      const retry = await send(a, matchId, 'Hello', id);
      expect(retry.status).toBe(200);
      expect(await Message.count()).toBe(1);
    });

    it('validates messages', async () => {
      const { a, matchId } = await createMatchedPair(app);
      for (const body of [
        { clientMessageId: randomUUID(), body: '   ' },
        { clientMessageId: randomUUID(), body: 'x'.repeat(1001) },
        { clientMessageId: 'nope', body: 'Hi' },
        { clientMessageId: randomUUID(), body: 'Hi', senderId: a.userId },
      ]) {
        const res = await request(app)
          .post(`/api/v1/chats/${matchId}/messages`)
          .set(bearer(a.accessToken))
          .send(body);
        expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400);
      }
      // Invisible characters are stripped and the text is stored as plain text.
      const res = await send(a, matchId, '  <b>hi</b>​  ');
      expect(res.body.data.body).toBe('<b>hi</b>');
    });

    it('flags contact details for moderation without blocking or exposing the flag', async () => {
      const { a, matchId } = await createMatchedPair(app);
      const res = await send(a, matchId, 'Call me on 98765 43210 or pay me@okaxis');
      expect(res.status).toBe(201);
      expect(res.body.data).not.toHaveProperty('containsContactInfo');
      expect((await Message.findByPk(res.body.data.id as string))?.containsContactInfo).toBe(true);
    });

    it('rate-limits sending (30 per minute across transports)', async () => {
      const { a, matchId } = await createMatchedPair(app);
      for (let i = 0; i < 30; i += 1) await send(a, matchId, `m${String(i)}`).expect(201);
      const limited = await send(a, matchId, 'one too many');
      expect(limited.status).toBe(429);
      expect(limited.headers['retry-after']).toBeDefined();
    });
  });

  describe('authorization', () => {
    it('only the two members can read or write, everyone else gets 404', async () => {
      const { a, matchId } = await createMatchedPair(app);
      await send(a, matchId, 'Private').expect(201);
      const stranger = await createMember(app);
      expect((await history(stranger, matchId)).status).toBe(404);
      expect((await send(stranger, matchId, 'Let me in')).status).toBe(404);
      expect(
        (await request(app).get(`/api/v1/chats/${matchId}`).set(bearer(stranger.accessToken)))
          .status,
      ).toBe(404);
      expect((await request(app).get(`/api/v1/chats/${matchId}/messages`)).status).toBe(401);
    });

    it('closes the chat after unmatching', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      await send(a, matchId, 'Hi').expect(201);
      await request(app)
        .post(`/api/v1/matches/${matchId}/unmatch`)
        .set(bearer(b.accessToken))
        .expect(200);
      const res = await send(a, matchId, 'Still there?');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('MATCH_NOT_ACTIVE');
      expect((await history(a, matchId)).status).toBe(409);
      expect(await chats(a)).toEqual([]);
    });

    it('blocked members cannot chat, in either direction', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      await request(app)
        .post('/api/v1/blocks')
        .set(bearer(a.accessToken))
        .send({ userId: b.userId })
        .expect(201);
      expect((await send(b, matchId, 'Why?')).body.error.code).toBe('MATCH_NOT_ACTIVE');
      expect((await send(a, matchId, 'Bye')).body.error.code).toBe('MATCH_NOT_ACTIVE');
      expect(await chats(b)).toEqual([]);
    });

    it('suspended members cannot chat, and their chats are hidden from the partner', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      await send(a, matchId, 'Hello').expect(201);
      await User.update({ status: 'suspended' }, { where: { id: a.userId } });

      expect((await send(a, matchId, 'Hi again')).status).toBe(403);
      expect((await history(a, matchId)).status).toBe(403);
      expect((await send(b, matchId, 'Are you there?')).body.error.code).toBe('MATCH_NOT_ACTIVE');
      expect(await chats(b)).toEqual([]);
      expect(await unread(b)).toBe(0);
    });
  });

  describe('chat list, unread counts and read status', () => {
    it('counts unread messages and marks them read (positions only move forward)', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      const first = (await send(a, matchId, 'One')).body.data as MessageDto;
      const second = (await send(a, matchId, 'Two')).body.data as MessageDto;
      await send(b, matchId, 'Reply').expect(201);

      const [chat] = await chats(b);
      expect(chat).toMatchObject({
        matchId,
        unreadCount: 2,
        lastMessage: { body: 'Reply', senderId: b.userId },
        partnerLastReadAt: null,
      });
      expect(chat?.partner.id).toBe(a.userId);
      expect(await unread(b)).toBe(2);
      expect(await unread(a)).toBe(1);

      const read = await request(app)
        .post(`/api/v1/chats/${matchId}/read`)
        .set(bearer(b.accessToken))
        .send({ lastReadMessageId: second.id });
      expect(read.status).toBe(200);
      expect(read.body.data.lastReadAt).toBe(second.createdAt);
      expect(await unread(b)).toBe(0);

      // Going back to an older message doesn't move the read position backwards.
      const back = await request(app)
        .post(`/api/v1/chats/${matchId}/read`)
        .set(bearer(b.accessToken))
        .send({ lastReadMessageId: first.id });
      expect(back.body.data.lastReadAt).toBe(second.createdAt);

      // The sender sees "Seen" up to where the partner read.
      const [fromA] = await chats(a);
      expect(fromA?.partnerLastReadAt).toBe(second.createdAt);
    });

    it('orders chats by latest activity and refuses read markers from another chat', async () => {
      const first = await createMatchedPair(app);
      const other = await createMember(app, { name: 'Chetan' });
      await request(app)
        .post('/api/v1/interests')
        .set(bearer(first.a.accessToken))
        .send({ receiverId: other.userId })
        .expect(201);
      const second = await request(app)
        .post('/api/v1/interests')
        .set(bearer(other.accessToken))
        .send({ receiverId: first.a.userId })
        .expect(201);
      const secondMatchId = second.body.data.match.id as string;

      const msg = (await send(first.b, first.matchId, 'Newest')).body.data as MessageDto;
      const list = await chats(first.a);
      expect(list.map((c) => c.matchId)).toEqual([first.matchId, secondMatchId]);

      const wrong = await request(app)
        .post(`/api/v1/chats/${secondMatchId}/read`)
        .set(bearer(first.a.accessToken))
        .send({ lastReadMessageId: msg.id });
      expect(wrong.status).toBe(404);
    });
  });

  describe('reporting messages', () => {
    it('snapshots the reported message with earlier context and closes the chat', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      for (let i = 1; i <= 12; i += 1) {
        await send(i % 2 === 0 ? a : b, matchId, `line ${String(i)}`).expect(201);
      }
      const bad = (await send(b, matchId, 'Send me money now')).body.data as MessageDto;

      const res = await request(app)
        .post('/api/v1/reports')
        .set(bearer(a.accessToken))
        .send({ reportedUserId: b.userId, reason: 'spam', messageId: bad.id });
      expect(res.status).toBe(201);

      const report = await Report.findByPk(res.body.data.reportId as string);
      const messages = report?.evidence.messages ?? [];
      expect(messages).toHaveLength(11); // 10 earlier + the reported one
      expect(messages.at(-1)).toMatchObject({ id: bad.id, reported: true, senderRole: 'reported' });
      expect(messages[0]?.body).toBe('line 3');
      expect(report?.matchId).toBe(matchId);

      // The report ends the match: the chat is closed for both.
      expect((await Match.findByPk(matchId))?.status).toBe('blocked');
      expect((await send(b, matchId, 'Hello?')).body.error.code).toBe('MATCH_NOT_ACTIVE');
    });

    it('only lets members report the other member’s messages in their own chats', async () => {
      const { a, b, matchId } = await createMatchedPair(app);
      const mine = (await send(a, matchId, 'My own message')).body.data as MessageDto;
      const theirs = (await send(b, matchId, 'Their message')).body.data as MessageDto;

      const own = await request(app)
        .post('/api/v1/reports')
        .set(bearer(a.accessToken))
        .send({ reportedUserId: b.userId, reason: 'harassment', messageId: mine.id });
      expect(own.status).toBe(400);

      const stranger = await createMember(app);
      const foreign = await request(app)
        .post('/api/v1/reports')
        .set(bearer(stranger.accessToken))
        .send({ reportedUserId: b.userId, reason: 'harassment', messageId: theirs.id });
      expect(foreign.status).toBe(404);
    });
  });
});
