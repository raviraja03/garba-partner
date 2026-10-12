import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationDelivery, NotificationPreference } from '../../models/index.js';
import { createMessageProviders } from '../../providers/messaging/index.js';
import {
  createMetaClientFromEnv,
  metaMessageRef,
  signMetaBody,
} from '../../providers/meta/index.js';
import type { FetchLike } from '../../providers/meta/index.js';
import { bearer } from '../../test/event-fixtures.js';
import {
  createTestApp,
  createTestEnv,
  hasTestDatabase,
  useTestDatabase,
} from '../../test/helpers.js';
import { createMember } from '../../test/member-fixtures.js';

const PHONE_NUMBER_ID = '100000000000001';
const APP_SECRET = 'test-meta-app-secret-0000';
const VERIFY_TOKEN = 'test-meta-verify-token-00';
const PATH = '/api/v1/webhooks/meta/whatsapp';

const env = createTestEnv({
  WHATSAPP_ENABLED: 'true',
  MESSAGING_PROVIDER: 'meta',
  META_WHATSAPP_ACCESS_TOKEN: 'test-meta-access-token-000000',
  META_WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
  META_WHATSAPP_APP_SECRET: APP_SECRET,
  META_WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
  META_WHATSAPP_TEMPLATES: 'interest_received:garba_new_interest',
});

interface SentMessage {
  to: string;
  template: string;
  wamid: string;
}

/** Stands in for Meta: accepts every message (or refuses, when `refuse` is set) and records it. */
function fakeMeta() {
  const sent: SentMessage[] = [];
  const state: { refuse: { code: number; message: string } | null } = { refuse: null };
  const fetchImpl: FetchLike = (_url, init) => {
    const body = JSON.parse(init.body as string) as {
      to: string;
      template: { name: string; components?: { parameters: { text: string }[] }[] };
    };
    if (state.refuse) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              message: `(#${String(state.refuse.code)}) ${state.refuse.message}`,
              code: state.refuse.code,
            },
          }),
          { status: 400 },
        ),
      );
    }
    const wamid = `wamid.${Buffer.from(`${body.to}:${randomUUID()}`).toString('base64')}`;
    sent.push({
      to: body.to,
      template: body.template.name,
      wamid,
    });
    return Promise.resolve(
      new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: wamid }] }), {
        status: 200,
      }),
    );
  };
  return { sent, state, fetchImpl };
}

/** A status report in Meta's shape. */
const report = (
  statuses: { id: string; status: string; timestamp?: number; errors?: unknown[] }[],
  phoneNumberId = PHONE_NUMBER_ID,
) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '200000000000002',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '918769795033', phone_number_id: phoneNumberId },
            statuses: statuses.map((s) => ({
              id: s.id,
              status: s.status,
              timestamp: String(s.timestamp ?? 1_760_000_000),
              recipient_id: '919876543210',
              ...(s.errors ? { errors: s.errors } : {}),
            })),
          },
        },
      ],
    },
  ],
});

describe.skipIf(!hasTestDatabase)('Meta WhatsApp: notifications and webhook (integration)', () => {
  const db = useTestDatabase();
  const logger = pino({ level: 'silent' });
  let meta: ReturnType<typeof fakeMeta>;
  let app: Express;
  beforeEach(() => {
    meta = fakeMeta();
    const client = createMetaClientFromEnv(env, meta.fetchImpl);
    app = createTestApp({
      sequelize: db(),
      env,
      messaging: createMessageProviders(env, logger, client),
    });
  });

  /** POSTs a webhook body exactly as Meta would: raw JSON plus its signature. */
  const deliver = (body: unknown, options: { signature?: string | null; secret?: string } = {}) => {
    const raw = JSON.stringify(body);
    const req = request(app).post(PATH).set('Content-Type', 'application/json');
    const signature =
      options.signature === undefined
        ? signMetaBody(raw, options.secret ?? APP_SECRET)
        : options.signature;
    return (signature === null ? req : req.set('X-Hub-Signature-256', signature)).send(raw);
  };
  describe('notifications', () => {
    it('an interest reaches a member who opted in, and delivery reports move it sent → delivered → read', async () => {
      const receiver = await createMember(app);
      const sender = await createMember(app, { gender: 'woman' });
      await request(app)
        .put('/api/v1/notifications/preferences')
        .set(bearer(receiver.accessToken))
        .send({ whatsapp: true })
        .expect(200);
      await request(app)
        .post('/api/v1/interests')
        .set(bearer(sender.accessToken))
        .send({ receiverId: receiver.userId })
        .expect(201);
      await vi.waitFor(async () => {
        expect(await NotificationDelivery.findOne()).toMatchObject({ status: 'sent' });
      });

      const [message] = meta.sent;
      expect(message).toMatchObject({
        to: `91${receiver.phone}`,
        template: 'garba_new_interest',
      });
      const row = await NotificationDelivery.findOne();
      expect(row).toMatchObject({
        channel: 'whatsapp',
        provider: 'meta',
        notificationType: 'interest_received',
        providerMessageId: metaMessageRef(message?.wamid ?? ''),
        recipient: `+91XXXXXX${receiver.phone.slice(-4)}`,
      });
      expect(JSON.stringify(row?.toJSON())).not.toContain(receiver.phone);

      const wamid = message?.wamid ?? '';
      await deliver(report([{ id: wamid, status: 'delivered', timestamp: 1_760_000_100 }])).expect(
        200,
      );
      expect(await NotificationDelivery.findOne()).toMatchObject({
        status: 'delivered',
        deliveredAt: new Date(1_760_000_100_000),
        readAt: null,
      });
      await deliver(report([{ id: wamid, status: 'read', timestamp: 1_760_000_200 }])).expect(200);
      expect(await NotificationDelivery.findOne()).toMatchObject({
        status: 'read',
        deliveredAt: new Date(1_760_000_100_000),
        readAt: new Date(1_760_000_200_000),
      });
    });

    it('a member who has not opted in gets the in-app notification but nothing on WhatsApp', async () => {
      const receiver = await createMember(app);
      const sender = await createMember(app, { gender: 'woman' });
      const prefs = await request(app)
        .get('/api/v1/notifications/preferences')
        .set(bearer(receiver.accessToken));
      expect((prefs.body as { data: { whatsapp: boolean } }).data.whatsapp).toBe(false);

      await request(app)
        .post('/api/v1/interests')
        .set(bearer(sender.accessToken))
        .send({ receiverId: receiver.userId })
        .expect(201);
      const inApp = await request(app)
        .get('/api/v1/notifications')
        .set(bearer(receiver.accessToken));
      expect((inApp.body as { data: unknown[] }).data).toHaveLength(1);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(meta.sent).toHaveLength(0);
      expect(await NotificationDelivery.count()).toBe(0);
    });

    it('opting in records when; opting out clears it and stops WhatsApp', async () => {
      const member = await createMember(app);
      const put = (body: object) =>
        request(app)
          .put('/api/v1/notifications/preferences')
          .set(bearer(member.accessToken))
          .send(body);

      expect(
        ((await put({ whatsapp: true }).expect(200)).body as { data: { whatsapp: boolean } }).data
          .whatsapp,
      ).toBe(true);
      const on = await NotificationPreference.findByPk(member.userId);
      expect(on?.whatsappOptInAt).toBeInstanceOf(Date);
      // Changing another setting leaves the consent alone.
      await put({ new_message: false }).expect(200);
      expect((await NotificationPreference.findByPk(member.userId))?.whatsappOptIn).toBe(true);

      expect(
        ((await put({ whatsapp: false }).expect(200)).body as { data: { whatsapp: boolean } }).data
          .whatsapp,
      ).toBe(false);
      expect(await NotificationPreference.findByPk(member.userId)).toMatchObject({
        whatsappOptIn: false,
        whatsappOptInAt: null,
        newMessage: false,
      });
      await put({ whatsapp: 'yes' }).expect(400);
    });
  });

  describe('webhook', () => {
    /** A sent WhatsApp notification to report on. */
    async function sentDelivery(): Promise<{ wamid: string; id: string }> {
      const member = await createMember(app);
      const wamid = `wamid.${Buffer.from(randomUUID()).toString('base64')}`;
      const row = await NotificationDelivery.create({
        userId: member.userId,
        notificationType: 'match_created',
        title: 'New match',
        message: 'GarbaMates: you have a new Garba match. Open the app to say hello.',
        channel: 'whatsapp',
        recipient: '+91XXXXXX0000',
        status: 'sent',
        provider: 'meta',
        providerMessageId: metaMessageRef(wamid),
        referenceKey: `${randomUUID()}:whatsapp`,
        sentAt: new Date(),
      });
      return { wamid, id: row.id };
    }
    const statusOf = async (id: string) => (await NotificationDelivery.findByPk(id))?.status;

    it('GET: answers Meta’s check with the challenge only when the verify token matches', async () => {
      const ok = await request(app)
        .get(PATH)
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': '1158201444',
        })
        .expect(200);
      expect(ok.text).toBe('1158201444');
      expect(ok.headers['content-type']).toContain('text/plain');

      for (const query of [
        {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token-000000000000',
          'hub.challenge': '1',
        },
        { 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1' },
        { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN },
        {
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': '<script>',
        },
        {},
      ]) {
        const res = await request(app).get(PATH).query(query).expect(403);
        expect(res.text).not.toContain(VERIFY_TOKEN);
      }
    });

    it('POST: a valid signature is accepted and applied', async () => {
      const { wamid, id } = await sentDelivery();
      await deliver(report([{ id: wamid, status: 'delivered' }])).expect(200);
      expect(await statusOf(id)).toBe('delivered');
    });

    it('POST: a missing, wrong or forged signature changes nothing', async () => {
      const { wamid, id } = await sentDelivery();
      const body = report([
        { id: wamid, status: 'failed', errors: [{ code: 131026, title: 'x' }] },
      ]);

      await deliver(body, { signature: null }).expect(401);
      await deliver(body, { secret: 'not-the-app-secret-00000' }).expect(401);
      await deliver(body, { signature: 'sha256=' + '0'.repeat(64) }).expect(401);
      await deliver(body, { signature: 'not-a-signature' }).expect(401);
      // Signed for a different body than the one sent.
      await deliver(body, {
        signature: signMetaBody(JSON.stringify(report([])), APP_SECRET),
      }).expect(401);

      expect(await statusOf(id)).toBe('sent');
      expect((await NotificationDelivery.findByPk(id))?.errorMessage).toBeNull();
    });

    it('the signature covers the exact bytes, including non-ASCII text', async () => {
      const { wamid, id } = await sentDelivery();
      const raw = JSON.stringify({
        ...report([{ id: wamid, status: 'delivered' }]),
        note: 'નમસ્તે — ✓',
      });
      await request(app)
        .post(PATH)
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signMetaBody(raw, APP_SECRET))
        .send(raw)
        .expect(200);
      expect(await statusOf(id)).toBe('delivered');
    });

    it('the same report twice, and reports out of order, never move a status backwards', async () => {
      const { wamid, id } = await sentDelivery();
      const read = report([{ id: wamid, status: 'read', timestamp: 1_760_000_300 }]);

      await deliver(read).expect(200);
      await deliver(read).expect(200); // Meta retries: a duplicate
      await deliver(report([{ id: wamid, status: 'delivered', timestamp: 1_760_000_100 }])).expect(
        200,
      );
      await deliver(report([{ id: wamid, status: 'sent', timestamp: 1_760_000_050 }])).expect(200);
      await deliver(
        report([
          {
            id: wamid,
            status: 'failed',
            errors: [{ code: 131000, title: 'Something went wrong' }],
          },
        ]),
      ).expect(200);

      const row = await NotificationDelivery.findByPk(id);
      expect(row).toMatchObject({
        status: 'read',
        readAt: new Date(1_760_000_300_000),
        failedAt: null,
        errorMessage: null,
      });
    });

    it('a failure report stores a cleaned-up reason', async () => {
      const { wamid, id } = await sentDelivery();
      await deliver(
        report([
          {
            id: wamid,
            status: 'failed',
            timestamp: 1_760_000_400,
            errors: [
              {
                code: 131049,
                title: 'This message was not delivered to maintain healthy ecosystem engagement',
                error_data: { details: 'Recipient 919876543210, contact ops@example.com' },
                href: 'https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/',
              },
            ],
          },
        ]),
      ).expect(200);
      expect(await NotificationDelivery.findByPk(id)).toMatchObject({
        status: 'failed',
        failedAt: new Date(1_760_000_400_000),
        errorMessage:
          '[E131049] This message was not delivered to maintain healthy ecosystem engagement — Recipient [digits], contact [email]',
      });
    });

    it('ignores reports for another number, unknown messages, untracked statuses and odd shapes', async () => {
      const { wamid, id } = await sentDelivery();
      await deliver(report([{ id: wamid, status: 'delivered' }], '999999999999999')).expect(200);
      await deliver(report([{ id: 'wamid.UNKNOWN', status: 'delivered' }])).expect(200);
      await deliver(report([{ id: wamid, status: 'played' }])).expect(200);
      await deliver({ object: 'page', entry: [] }).expect(200);
      await deliver({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ field: 'messages', value: null }] }],
      }).expect(200);
      await deliver({ object: 'whatsapp_business_account', entry: 'nonsense' }).expect(200);
      await deliver([1, 2, 3]).expect(200);
      expect(await statusOf(id)).toBe('sent');
    });

    it('handles several reports in one call', async () => {
      const a = await sentDelivery();
      const b = await sentDelivery();
      await deliver(
        report([
          { id: a.wamid, status: 'delivered' },
          { id: b.wamid, status: 'read' },
        ]),
      ).expect(200);
      expect([await statusOf(a.id), await statusOf(b.id)]).toEqual(['delivered', 'read']);
    });

    it('does not exist when Meta is not configured', async () => {
      const plain = createTestApp({ sequelize: db() });
      await request(plain).get(PATH).query({ 'hub.mode': 'subscribe' }).expect(404);
      await request(plain).post(PATH).send({}).expect(404);
    });
  });
});
