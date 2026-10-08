import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../lib/logger.js';
import { Notification, NotificationDelivery, User } from '../../models/index.js';
import type {
  MessageProvider,
  MessageProviders,
  OutboundMessage,
} from '../../providers/messaging/index.js';
import { createMessageProviders } from '../../providers/messaging/index.js';
import { bearer } from '../../test/event-fixtures.js';
import {
  createFakeMediaStorage,
  createTestApp,
  createTestEnv,
  hasTestDatabase,
  useTestDatabase,
  type FakeMediaStorage,
} from '../../test/helpers.js';
import { createMatchedPair, createMember, type TestMember } from '../../test/member-fixtures.js';
import { channelTextFor, createChannelNotifier, type ChannelNotifier } from './channel-notifier.js';

/** A provider under test control: records what it was asked to send, or fails on demand. */
function fakeProvider(channel: 'sms' | 'whatsapp', fail?: string) {
  const sent: OutboundMessage[] = [];
  const provider: MessageProvider = {
    name: `fake-${channel}`,
    channel,
    send(message) {
      if (fail) return Promise.reject(new Error(fail));
      sent.push(message);
      return Promise.resolve({ providerMessageId: `${channel}-${String(sent.length)}` });
    },
  };
  return { provider, sent };
}

describe.skipIf(!hasTestDatabase)('SMS and WhatsApp notification channels (integration)', () => {
  const db = useTestDatabase();
  const env = createTestEnv();
  let logText = '';
  const logger = createLogger(
    { LOG_LEVEL: 'info', NODE_ENV: 'test' },
    new Writable({
      write(chunk: Buffer, _encoding, done) {
        logText += chunk.toString('utf8');
        done();
      },
    }),
  );
  let app: Express;
  let member: TestMember;
  // One image store for every app in a test: image IDs must stay unique across them.
  let media: FakeMediaStorage;

  beforeEach(async () => {
    logText = '';
    media = createFakeMediaStorage();
    app = createTestApp({ sequelize: db(), media });
    member = await createMember(app);
  });

  const notifierWith = (providers: MessageProviders): ChannelNotifier =>
    createChannelNotifier({ sequelize: db(), env, providers, logger });
  const input = (referenceId = randomUUID()) => ({
    userId: member.userId,
    type: 'match_created' as const,
    ...channelTextFor('match_created'),
    referenceId,
  });
  const deliveries = () => NotificationDelivery.findAll({ order: [['channel', 'ASC']] });
  const e164 = () => `+91${member.phone}`;

  it('both channels succeed: two SENT rows, masked recipient, full number only to the provider', async () => {
    const sms = fakeProvider('sms');
    const whatsapp = fakeProvider('whatsapp');
    const outcomes = await notifierWith({
      sms: sms.provider,
      whatsapp: whatsapp.provider,
    }).sendNotification(input());

    expect(outcomes).toEqual([
      { channel: 'sms', status: 'sent' },
      { channel: 'whatsapp', status: 'sent' },
    ]);
    expect(sms.sent[0]?.to).toBe(e164());
    expect(whatsapp.sent[0]?.to).toBe(e164());
    expect(sms.sent[0]?.text).toBe(
      'GarbaMates: you have a new Garba match. Open the app to say hello.',
    );

    const rows = await deliveries();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        userId: member.userId,
        notificationType: 'match_created',
        title: 'New match',
        status: 'sent',
        recipient: `+91XXXXXX${member.phone.slice(-4)}`,
        provider: `fake-${row.channel}`,
        providerMessageId: `${row.channel}-1`,
        errorMessage: null,
      });
      expect(row.sentAt).toBeInstanceOf(Date);
      expect(JSON.stringify(row.toJSON())).not.toContain(member.phone);
    }
    expect(logText).toContain(`[NOTIFICATION] SMS | userId=${member.userId} | status=SENT`);
    expect(logText).toContain(`[NOTIFICATION] WHATSAPP | userId=${member.userId} | status=SENT`);
    expect(logText).not.toContain(member.phone);
  });

  it('SMS succeeds, WhatsApp fails: one SENT and one FAILED row, nothing thrown', async () => {
    const sms = fakeProvider('sms');
    const whatsapp = fakeProvider(
      'whatsapp',
      `Template rejected for ${`+91${'9'.repeat(10)}`} (key sk-live)`,
    );
    const outcomes = await notifierWith({
      sms: sms.provider,
      whatsapp: whatsapp.provider,
    }).sendNotification(input());

    expect(outcomes).toEqual([
      { channel: 'sms', status: 'sent' },
      { channel: 'whatsapp', status: 'failed' },
    ]);
    const [smsRow, whatsappRow] = await deliveries();
    expect(smsRow).toMatchObject({ channel: 'sms', status: 'sent' });
    expect(whatsappRow).toMatchObject({ channel: 'whatsapp', status: 'failed', sentAt: null });
    // The provider's error is stored with the number masked.
    expect(whatsappRow?.errorMessage).toBe('Template rejected for [digits] (key sk-live)');
    expect(logText).toContain(
      `[NOTIFICATION] WHATSAPP | userId=${member.userId} | status=FAILED | error=Template rejected for [digits]`,
    );
  });

  it('SMS fails, WhatsApp succeeds', async () => {
    const sms = fakeProvider('sms', 'Provider timeout');
    const whatsapp = fakeProvider('whatsapp');
    const outcomes = await notifierWith({
      sms: sms.provider,
      whatsapp: whatsapp.provider,
    }).sendNotification(input());
    expect(outcomes.map((o) => o.status)).toEqual(['failed', 'sent']);
    const [smsRow, whatsappRow] = await deliveries();
    expect(smsRow).toMatchObject({ status: 'failed', errorMessage: 'Provider timeout' });
    expect(whatsappRow).toMatchObject({ status: 'sent' });
  });

  it('both fail: two FAILED rows and still nothing thrown', async () => {
    const outcomes = await notifierWith({
      sms: fakeProvider('sms', 'SMS gateway down').provider,
      whatsapp: fakeProvider('whatsapp', 'WhatsApp gateway down').provider,
    }).sendNotification(input());
    expect(outcomes.map((o) => o.status)).toEqual(['failed', 'failed']);
    expect((await deliveries()).map((row) => [row.channel, row.status, row.errorMessage])).toEqual([
      ['sms', 'failed', 'SMS gateway down'],
      ['whatsapp', 'failed', 'WhatsApp gateway down'],
    ]);
  });

  it('sends the same reference only once per channel, even when called at the same time', async () => {
    const sms = fakeProvider('sms');
    const whatsapp = fakeProvider('whatsapp');
    const notifier = notifierWith({ sms: sms.provider, whatsapp: whatsapp.provider });
    const same = input();

    const results = await Promise.all([1, 2, 3, 4, 5].map(() => notifier.sendNotification(same)));
    await notifier.sendNotification(same);

    expect(sms.sent).toHaveLength(1);
    expect(whatsapp.sent).toHaveLength(1);
    expect(await deliveries()).toHaveLength(2);
    expect(results.flat().filter((o) => o.status === 'sent')).toHaveLength(2);
    expect(results.flat().filter((o) => o.status === 'skipped')).toHaveLength(8);
    // A different reference is a different notification.
    await notifier.sendNotification(input());
    expect(sms.sent).toHaveLength(2);
  });

  it('sendSMS and sendWhatsApp send one channel each; a channel that is off is skipped', async () => {
    const sms = fakeProvider('sms');
    const notifier = notifierWith({ sms: sms.provider, whatsapp: null });
    expect(await notifier.sendWhatsApp(input())).toEqual({
      channel: 'whatsapp',
      status: 'skipped',
    });
    expect(await notifier.sendSMS(input())).toEqual({ channel: 'sms', status: 'sent' });
    expect(await notifier.sendNotification(input())).toEqual([{ channel: 'sms', status: 'sent' }]);
    expect((await deliveries()).map((row) => row.channel)).toEqual(['sms', 'sms']);
    expect(await notifierWith({ sms: null, whatsapp: null }).sendNotification(input())).toEqual([]);
  });

  it('skips members who are banned or have no number, and survives a database failure', async () => {
    const sms = fakeProvider('sms');
    const notifier = notifierWith({ sms: sms.provider, whatsapp: null });

    await User.update({ status: 'banned' }, { where: { id: member.userId } });
    expect(await notifier.sendNotification(input())).toEqual([
      { channel: 'sms', status: 'skipped' },
    ]);
    await User.update({ status: 'active' }, { where: { id: member.userId } });

    const spy = vi.spyOn(User, 'findOne').mockRejectedValueOnce(new Error('connection lost'));
    expect(await notifier.sendNotification(input())).toEqual([
      { channel: 'sms', status: 'failed' },
    ]);
    spy.mockRestore();
    expect(sms.sent).toHaveLength(0);
    expect(await deliveries()).toHaveLength(0);
  });

  it('an in-app notification is also sent over both channels, once, and the API call still succeeds', async () => {
    const sms = fakeProvider('sms');
    const whatsapp = fakeProvider('whatsapp', 'WhatsApp gateway down');
    app = createTestApp({
      sequelize: db(),
      media,
      messaging: { sms: sms.provider, whatsapp: whatsapp.provider },
    });
    const sender = await createMember(app, { gender: 'woman' });

    // The request succeeds although one channel fails.
    await request(app)
      .post('/api/v1/interests')
      .set(bearer(sender.accessToken))
      .send({ receiverId: member.userId })
      .expect(201);

    await vi.waitFor(async () => {
      expect(await NotificationDelivery.count()).toBe(2);
      expect((await deliveries()).every((row) => row.status !== 'pending')).toBe(true);
    });
    const notification = await Notification.findOne({ where: { userId: member.userId } });
    const rows = await deliveries();
    expect(rows.map((row) => [row.channel, row.status, row.notificationType])).toEqual([
      ['sms', 'sent', 'interest_received'],
      ['whatsapp', 'failed', 'interest_received'],
    ]);
    expect(rows.every((row) => row.notificationId === notification?.id)).toBe(true);
    expect(
      rows.every((row) => row.referenceKey === `${notification?.id ?? ''}:${row.channel}`),
    ).toBe(true);
    // Generic wording: the sender is not named in a text that can show on a lock screen.
    expect(sms.sent[0]?.text).toBe(
      'GarbaMates: someone would like to be your Garba partner. Open the app to respond.',
    );
    expect(sms.sent[0]?.to).toBe(e164());
  });

  it('several chat messages produce one SMS for the unread chat, not one per message', async () => {
    const sms = fakeProvider('sms');
    app = createTestApp({
      sequelize: db(),
      media,
      messaging: { sms: sms.provider, whatsapp: null },
    });
    const { a: sender, matchId } = await createMatchedPair(app);

    for (const body of ['Hi!', 'Are you going on Saturday?', 'I can teach you dodhiyu']) {
      await request(app)
        .post(`/api/v1/chats/${matchId}/messages`)
        .set(bearer(sender.accessToken))
        .send({ clientMessageId: randomUUID(), body })
        .expect(201);
    }
    await vi.waitFor(async () => {
      expect(await NotificationDelivery.count({ where: { notificationType: 'new_message' } })).toBe(
        1,
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await NotificationDelivery.count({ where: { notificationType: 'new_message' } })).toBe(
      1,
    );
    const texts = sms.sent.map((message) => message.text);
    expect(texts.filter((text) => text.includes('new messages'))).toHaveLength(1);
    // Chat text never leaves the app.
    expect(texts.join(' ')).not.toContain('dodhiyu');
  });

  it('the development log provider records SENT and prints a masked line', async () => {
    const providers = createMessageProviders(
      { SMS_ENABLED: true, WHATSAPP_ENABLED: false },
      logger,
    );
    expect(providers.whatsapp).toBeNull();
    const outcomes = await notifierWith(providers).sendNotification(input());
    expect(outcomes).toEqual([{ channel: 'sms', status: 'sent' }]);
    const [row] = await deliveries();
    expect(row).toMatchObject({ provider: 'log', status: 'sent' });
    expect(row?.providerMessageId).toMatch(/^log-/);
    expect(logText).toContain(
      `[NOTIFICATION] SMS | to=+91XXXXXX${member.phone.slice(-4)} | not sent (development log provider)`,
    );
    expect(logText).not.toContain(member.phone);
  });
});
