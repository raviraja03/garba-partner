import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { NotificationDelivery } from '../../models/index.js';
import {
  createChannelNotifier,
  channelTextFor,
} from '../../modules/notifications/channel-notifier.js';
import {
  createTestApp,
  createTestEnv,
  hasTestDatabase,
  newTestPhone,
  uniqueIp,
  useTestDatabase,
} from '../../test/helpers.js';
import { createMember } from '../../test/member-fixtures.js';
import { createMessageProviders } from '../messaging/index.js';
import { createSmsProvider } from '../sms/index.js';
import type { FetchLike } from './client.js';

const AUTH_KEY = 'test-msg91-auth-key-0000';

/** Stands in for MSG91: records request bodies; `fail` makes it refuse. */
function fakeMsg91(fail?: string) {
  const bodies: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    bodies.push({ url, body: JSON.parse(init.body as string) as Record<string, unknown> });
    return Promise.resolve(
      new Response(
        JSON.stringify(
          fail ? { type: 'error', message: fail } : { type: 'success', message: 'msg91-request-1' },
        ),
        { status: fail ? 400 : 200 },
      ),
    );
  };
  return { bodies, fetchImpl };
}

describe.skipIf(!hasTestDatabase)('MSG91 (integration, MSG91 itself replaced by a fake)', () => {
  const db = useTestDatabase();
  const otpEnv = createTestEnv({
    SMS_PROVIDER: 'msg91_whatsapp',
    MSG91_AUTH_KEY: AUTH_KEY,
    MSG91_WHATSAPP_NUMBER: '919000000001',
    MSG91_WHATSAPP_OTP_TEMPLATE: 'garbamates_login_code',
  });

  it('login: the code goes to WhatsApp through MSG91, never to the browser, and signs the member in', async () => {
    const msg91 = fakeMsg91();
    const app = createTestApp({
      sequelize: db(),
      env: otpEnv,
      sms: createSmsProvider(otpEnv, msg91.fetchImpl),
    });
    const phone = newTestPhone();
    const ip = uniqueIp();

    const sent = await request(app)
      .post('/api/v1/auth/send-otp')
      .set('X-Forwarded-For', ip)
      .send({ phone })
      .expect(200);
    expect((sent.body as { data: { devOtp?: string } }).data.devOtp).toBeUndefined();

    // The WhatsApp template message MSG91 was asked to send.
    const sentTo = (
      msg91.bodies[0]?.body as {
        payload: {
          template: {
            name: string;
            to_and_components: { to: string[]; components: { body_1: { value: string } } }[];
          };
        };
      }
    ).payload.template;
    expect(msg91.bodies[0]?.url).toContain('/whatsapp/');
    expect(sentTo.name).toBe('garbamates_login_code');
    const recipient = {
      mobiles: sentTo.to_and_components[0]?.to[0],
      otp: sentTo.to_and_components[0]?.components.body_1.value,
    };
    expect(recipient.mobiles).toBe(`91${phone}`);
    expect(recipient.otp).toMatch(/^\d{6}$/);
    expect(JSON.stringify(sent.body)).not.toContain(recipient.otp);

    const verified = await request(app)
      .post('/api/v1/auth/verify-otp')
      .set('X-Forwarded-For', ip)
      .send({ phone, code: recipient.otp })
      .expect(200);
    expect((verified.body as { data: { accessToken: string } }).data.accessToken).toBeTruthy();
  });

  it('login: when MSG91 refuses, the member gets a clear 503 and no code is usable from the response', async () => {
    const msg91 = fakeMsg91('Invalid authkey');
    const app = createTestApp({
      sequelize: db(),
      env: otpEnv,
      sms: createSmsProvider(otpEnv, msg91.fetchImpl),
    });
    const res = await request(app)
      .post('/api/v1/auth/send-otp')
      .set('X-Forwarded-For', uniqueIp())
      .send({ phone: newTestPhone() })
      .expect(503);
    expect((res.body as { message: string }).message).toBe(
      'We could not send the code. Please try again.',
    );
    // MSG91's own error text is not shown to the member.
    expect(JSON.stringify(res.body)).not.toContain('authkey');
  });

  it('notifications: sent for types that have a template, skipped (no row) for the rest', async () => {
    const msg91 = fakeMsg91();
    const env = createTestEnv({
      SMS_ENABLED: 'true',
      WHATSAPP_ENABLED: 'true',
      MESSAGING_PROVIDER: 'msg91',
      MSG91_AUTH_KEY: AUTH_KEY,
      MSG91_SMS_TEMPLATE_IDS: 'match_created:sms_match_01',
      MSG91_WHATSAPP_NUMBER: '919000000001',
      MSG91_WHATSAPP_TEMPLATES: 'match_created:garba_new_match,booking:garba_pass_update',
    });
    const logger = pino({ level: 'silent' });
    const member = await createMember(createTestApp({ sequelize: db() }));
    const notifier = createChannelNotifier({
      sequelize: db(),
      env,
      providers: createMessageProviders(env, logger, msg91.fetchImpl),
      logger,
    });
    const send = (type: 'match_created' | 'booking' | 'new_message') =>
      notifier.sendNotification({
        userId: member.userId,
        type,
        ...channelTextFor(type),
        referenceId: `ref-${type}`,
      });

    expect(await send('match_created')).toEqual([
      { channel: 'sms', status: 'sent' },
      { channel: 'whatsapp', status: 'sent' },
    ]);
    expect(await send('booking')).toEqual([
      { channel: 'sms', status: 'skipped' },
      { channel: 'whatsapp', status: 'sent' },
    ]);
    expect(await send('new_message')).toEqual([
      { channel: 'sms', status: 'skipped' },
      { channel: 'whatsapp', status: 'skipped' },
    ]);

    const rows = await NotificationDelivery.findAll({
      order: [
        ['createdAt', 'ASC'],
        ['channel', 'ASC'],
      ],
    });
    expect(
      rows.map((row) => [
        row.notificationType,
        row.channel,
        row.status,
        row.provider,
        row.providerMessageId,
      ]),
    ).toEqual([
      ['match_created', 'sms', 'sent', 'msg91', 'msg91-request-1'],
      ['match_created', 'whatsapp', 'sent', 'msg91', 'msg91-request-1'],
      ['booking', 'whatsapp', 'sent', 'msg91', 'msg91-request-1'],
    ]);
    expect(msg91.bodies).toHaveLength(3);
    expect(JSON.stringify(rows.map((row) => row.toJSON()))).not.toContain(member.phone);
  });

  it('notifications: a MSG91 refusal is stored as FAILED with its reason, and nothing is thrown', async () => {
    const msg91 = fakeMsg91('Template not approved');
    const env = createTestEnv({
      SMS_ENABLED: 'true',
      MESSAGING_PROVIDER: 'msg91',
      MSG91_AUTH_KEY: AUTH_KEY,
      MSG91_SMS_TEMPLATE_IDS: 'match_created:sms_match_01',
    });
    const logger = pino({ level: 'silent' });
    const member = await createMember(createTestApp({ sequelize: db() }));
    const outcomes = await createChannelNotifier({
      sequelize: db(),
      env,
      providers: createMessageProviders(env, logger, msg91.fetchImpl),
      logger,
    }).sendNotification({
      userId: member.userId,
      type: 'match_created',
      ...channelTextFor('match_created'),
      referenceId: 'ref-failed',
    });
    expect(outcomes).toEqual([{ channel: 'sms', status: 'failed' }]);
    await vi.waitFor(async () => {
      const row = await NotificationDelivery.findOne();
      expect(row).toMatchObject({
        status: 'failed',
        errorMessage: 'Template not approved',
        provider: 'msg91',
      });
    });
  });
});
