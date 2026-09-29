import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, ServerToClientEvents, SocketAck } from '@garba-partner/shared';
import { Message, User, UserSession } from '../models/index.js';
import { bearer } from '../test/event-fixtures.js';
import {
  hasTestDatabase,
  loginAdmin,
  loginMember,
  startTestServer,
  uniqueIp,
  useTestDatabase,
} from '../test/helpers.js';
import { createMatchedPair, createMember } from '../test/member-fixtures.js';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

describe.skipIf(!hasTestDatabase)('Socket.IO chat (integration)', () => {
  const db = useTestDatabase();
  let server: Awaited<ReturnType<typeof startTestServer>>;
  const clients: Client[] = [];

  beforeEach(async () => {
    server = await startTestServer({ sequelize: db() });
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    await server.close();
  });

  function socketFor(token: string | undefined): Client {
    const client: Client = connectClient(server.url, {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      auth: token === undefined ? {} : { token },
    });
    clients.push(client);
    return client;
  }

  /** Resolves on connect, rejects with the server's connect_error code. */
  function connect(token: string | undefined): Promise<Client> {
    const client = socketFor(token);
    return new Promise((resolve, reject) => {
      client.once('connect', () => {
        resolve(client);
      });
      client.once('connect_error', (error) => {
        reject(new Error(error.message));
      });
    });
  }

  function next<E extends keyof ServerToClientEvents>(
    client: Client,
    event: E,
    timeoutMs = 3000,
  ): Promise<Parameters<ServerToClientEvents[E]>[0]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timed out waiting for ${event}`));
      }, timeoutMs);
      const listener = ((payload: Parameters<ServerToClientEvents[E]>[0]) => {
        clearTimeout(timer);
        resolve(payload);
      }) as ServerToClientEvents[E];
      (client as unknown as { once: (e: string, l: unknown) => void }).once(event, listener);
    });
  }

  /** Resolves true if the event arrives within the window, false otherwise. */
  async function arrives(client: Client, event: keyof ServerToClientEvents, ms = 400) {
    return next(client, event, ms).then(
      () => true,
      () => false,
    );
  }

  const sendVia = (client: Client, matchId: string, body: string, clientMessageId = randomUUID()) =>
    client.emitWithAck('message:send', { matchId, clientMessageId, body });

  describe('authentication', () => {
    it('refuses connections without a valid member session', async () => {
      await expect(connect(undefined)).rejects.toThrow('UNAUTHENTICATED');
      await expect(connect('not-a-token')).rejects.toThrow('UNAUTHENTICATED');

      const admin = await loginAdmin(server.app, uniqueIp(), 'super_admin');
      await expect(connect(admin.accessToken)).rejects.toThrow('UNAUTHENTICATED');

      // Logged in but no profile yet.
      const newcomer = await loginMember(server.app, uniqueIp());
      await expect(connect(newcomer.accessToken)).rejects.toThrow('ONBOARDING_REQUIRED');
    });

    it('refuses suspended and banned members', async () => {
      const suspended = await createMember(server.app);
      await User.update({ status: 'suspended' }, { where: { id: suspended.userId } });
      await expect(connect(suspended.accessToken)).rejects.toThrow('ACCOUNT_SUSPENDED');

      const banned = await createMember(server.app);
      await User.update({ status: 'banned' }, { where: { id: banned.userId } });
      await expect(connect(banned.accessToken)).rejects.toThrow('ACCOUNT_BANNED');
    });
  });

  describe('messaging', () => {
    it('delivers a message to the partner and to the sender’s other tabs', async () => {
      const { a, b, matchId } = await createMatchedPair(server.app);
      const aTab1 = await connect(a.accessToken);
      const aTab2 = await connect(a.accessToken);
      const bSocket = await connect(b.accessToken);

      const received = next(bSocket, 'message:new');
      const otherTab = next(aTab2, 'message:new');
      const ack = await sendVia(aTab1, matchId, 'Hello over the socket!');

      expect(ack).toMatchObject({ ok: true, data: { matchId, senderId: a.userId } });
      if (!ack.ok) throw new Error('send failed');
      expect(await received).toEqual(ack.data);
      expect(await otherTab).toEqual(ack.data);
      expect(await Message.count()).toBe(1);

      // History over REST includes it.
      const history = await request(server.app)
        .get(`/api/v1/chats/${matchId}/messages`)
        .set(bearer(b.accessToken));
      expect(history.body.data[0].id).toBe(ack.data.id);
    });

    it('delivers REST-sent messages live too, and retries are idempotent', async () => {
      const { a, b, matchId } = await createMatchedPair(server.app);
      const bSocket = await connect(b.accessToken);
      const received = next(bSocket, 'message:new');
      const clientMessageId = randomUUID();
      await request(server.app)
        .post(`/api/v1/chats/${matchId}/messages`)
        .set(bearer(a.accessToken))
        .send({ clientMessageId, body: 'Sent over REST' })
        .expect(201);
      expect((await received).body).toBe('Sent over REST');

      const aSocket = await connect(a.accessToken);
      const retry = await sendVia(aSocket, matchId, 'Sent over REST', clientMessageId);
      expect(retry.ok).toBe(true);
      expect(await Message.count()).toBe(1);
      expect(await arrives(bSocket, 'message:new')).toBe(false); // no duplicate delivery
    });

    it('rejects non-members, invalid payloads and unacknowledged events', async () => {
      const { a, matchId } = await createMatchedPair(server.app);
      const stranger = await createMember(server.app);
      const strangerSocket = await connect(stranger.accessToken);
      const denied = await sendVia(strangerSocket, matchId, 'Let me in');
      expect(denied).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Chat not found.' },
      });

      const aSocket = await connect(a.accessToken);
      const empty = await sendVia(aSocket, matchId, '   ');
      expect(empty).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
      const extra = await aSocket.emitWithAck('message:send', {
        matchId,
        clientMessageId: randomUUID(),
        body: 'hi',
        senderId: stranger.userId,
      } as never);
      expect(extra.ok).toBe(false);

      // An event without an acknowledgement callback is ignored (nothing stored).
      aSocket.emit(
        'message:send',
        { matchId, clientMessageId: randomUUID(), body: 'x' },
        undefined as never,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await Message.count()).toBe(0);
    });

    it('sends read receipts to the other member', async () => {
      const { a, b, matchId } = await createMatchedPair(server.app);
      const aSocket = await connect(a.accessToken);
      const bSocket = await connect(b.accessToken);
      const ack = await sendVia(aSocket, matchId, 'Did you see this?');
      if (!ack.ok) throw new Error('send failed');

      const seen = next(aSocket, 'message:read');
      const read = (await bSocket.emitWithAck('message:read', {
        matchId,
        lastReadMessageId: ack.data.id,
      })) as SocketAck<{ lastReadAt: string }>;
      expect(read).toEqual({ ok: true, data: { lastReadAt: ack.data.createdAt } });
      expect(await seen).toEqual({ matchId, userId: b.userId, lastReadAt: ack.data.createdAt });
    });

    it('rate-limits messages per member', async () => {
      const { a, matchId } = await createMatchedPair(server.app);
      const aSocket = await connect(a.accessToken);
      for (let i = 0; i < 30; i += 1) {
        expect((await sendVia(aSocket, matchId, `m${String(i)}`)).ok).toBe(true);
      }
      const limited = await sendVia(aSocket, matchId, 'too many');
      expect(limited).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    });
  });

  describe('safety enforcement', () => {
    it('a block ends the chat live for both, and further sends fail', async () => {
      const { a, b, matchId } = await createMatchedPair(server.app);
      const aSocket = await connect(a.accessToken);
      const bSocket = await connect(b.accessToken);
      const endedForA = next(aSocket, 'match:ended');
      const endedForB = next(bSocket, 'match:ended');

      await request(server.app)
        .post('/api/v1/blocks')
        .set(bearer(b.accessToken))
        .send({ userId: a.userId })
        .expect(201);
      expect(await endedForA).toEqual({ matchId });
      expect(await endedForB).toEqual({ matchId });

      const blocked = await sendVia(aSocket, matchId, 'Hello?');
      expect(blocked).toMatchObject({ ok: false, error: { code: 'MATCH_NOT_ACTIVE' } });
    });

    it('unmatching ends the chat live', async () => {
      const { a, b, matchId } = await createMatchedPair(server.app);
      const bSocket = await connect(b.accessToken);
      const ended = next(bSocket, 'match:ended');
      await request(server.app)
        .post(`/api/v1/matches/${matchId}/unmatch`)
        .set(bearer(a.accessToken))
        .expect(200);
      expect(await ended).toEqual({ matchId });
      expect((await sendVia(bSocket, matchId, 'wait')).ok).toBe(false);
    });

    it('suspension by an admin disconnects the member immediately', async () => {
      const { a, matchId } = await createMatchedPair(server.app);
      const aSocket = await connect(a.accessToken);
      const ended = next(aSocket, 'session:ended');
      const disconnected = new Promise<void>((resolve) => {
        aSocket.once('disconnect', () => {
          resolve();
        });
      });

      const moderator = await loginAdmin(server.app, uniqueIp(), 'moderator');
      await request(server.app)
        .post(`/api/v1/admin/users/${a.userId}/suspend`)
        .set(bearer(moderator.accessToken))
        .send({ reason: 'Abusive messages' })
        .expect(200);

      expect(await ended).toEqual({ reason: 'account_restricted' });
      await disconnected;
      await expect(connect(a.accessToken)).rejects.toThrow('UNAUTHENTICATED');
      expect(await Message.count({ where: { matchId } })).toBe(0);
    });

    it('pushes notification:new with the unread total (never the message text)', async () => {
      const { a, b, matchId } = await createMatchedPair(server.app);
      const bSocket = await connect(b.accessToken);
      const pushed = next(bSocket, 'notification:new');
      const aSocket = await connect(a.accessToken);
      const ack = (await sendVia(aSocket, matchId, 'Meet at the north gate')) as SocketAck<unknown>;
      expect(ack.ok).toBe(true);
      const payload = await pushed;
      expect(payload.notification).toMatchObject({ type: 'new_message', matchId, count: 1 });
      // B also has the earlier interest and match notifications.
      expect(payload.unreadCount).toBe(3);
      expect(JSON.stringify(payload)).not.toContain('north gate');
    });

    it('a chat restriction refuses socket sends but keeps the member connected', async () => {
      const { a, b, matchId } = await createMatchedPair(server.app);
      const aSocket = await connect(a.accessToken);
      const bSocket = await connect(b.accessToken);
      const moderator = await loginAdmin(server.app, uniqueIp(), 'moderator');
      await request(server.app)
        .post(`/api/v1/admin/users/${a.userId}/restrict-chat`)
        .set(bearer(moderator.accessToken))
        .send({ reason: 'Hostile messages reported' })
        .expect(200);

      const refused = (await sendVia(aSocket, matchId, 'Still here')) as SocketAck<unknown>;
      expect(refused).toMatchObject({ ok: false, error: { code: 'CHAT_RESTRICTED' } });
      expect(aSocket.connected).toBe(true);
      const delivered = next(aSocket, 'message:new');
      const ack = (await sendVia(bSocket, matchId, 'Hello from B')) as SocketAck<unknown>;
      expect(ack.ok).toBe(true);
      expect(await delivered).toMatchObject({ body: 'Hello from B' });
      expect(await Message.count({ where: { matchId, senderId: a.userId } })).toBe(0);
    });

    it('stops accepting events once the session is revoked (logout)', async () => {
      const { a, matchId } = await createMatchedPair(server.app);
      const aSocket = await connect(a.accessToken);
      await UserSession.update(
        { revokedAt: new Date(), revokedReason: 'logout' },
        { where: { userId: a.userId } },
      );
      const res = await sendVia(aSocket, matchId, 'after logout');
      expect(res).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
      expect(await Message.count()).toBe(0);
    });
  });
});
