import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { loadServerEnv } from '@garba-partner/config/server';
import { createTestEnv } from '../../test/helpers.js';
import { createMessageProviders } from '../messaging/index.js';
import { parseTemplateMap } from '../messaging/template-map.js';
import {
  MetaWhatsAppError,
  createMetaClientFromEnv,
  metaMessageRef,
  signMetaBody,
  verifyMetaSignature,
  type FetchLike,
} from './index.js';
import { createMetaWhatsAppClient } from './whatsapp.client.js';

const TOKEN = 'test-meta-access-token-000000';
const PHONE_NUMBER_ID = '100000000000001';
const WAMID = 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSOEM3OUJDRjU3OTUzMjA1OUMxAA==';
const META_ENV = {
  META_WHATSAPP_ACCESS_TOKEN: TOKEN,
  META_WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
  META_WHATSAPP_APP_SECRET: 'test-meta-app-secret-0000',
  META_WHATSAPP_VERIFY_TOKEN: 'test-meta-verify-token-00',
};

interface Call {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

const accepted = () => ({
  status: 200,
  json: {
    messaging_product: 'whatsapp',
    contacts: [{ input: '919876543210', wa_id: '919876543210' }],
    messages: [{ id: WAMID }],
  },
});
const refused = (code: number, message: string, details?: string, status = 400) => ({
  status,
  json: {
    error: {
      message: `(#${String(code)}) ${message}`,
      type: 'OAuthException',
      code,
      ...(details ? { error_data: { messaging_product: 'whatsapp', details } } : {}),
      fbtrace_id: 'Az8or2yhqkZfEZ-_4Qn_Bam',
    },
  },
});

/** Stands in for Meta: answers each request with the next queued response. */
function fakeMeta(...responses: { status: number; json: unknown }[]) {
  const calls: Call[] = [];
  const waits: number[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string) as unknown,
    });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)] ?? accepted();
    return Promise.resolve(
      new Response(typeof next.json === 'string' ? next.json : JSON.stringify(next.json), {
        status: next.status,
      }),
    );
  };
  const client = createMetaWhatsAppClient({
    accessToken: TOKEN,
    phoneNumberId: PHONE_NUMBER_ID,
    apiVersion: 'v25.0',
    fetchImpl,
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });
  return { calls, waits, client, fetchImpl };
}

const send = { to: '+919876543210', template: 'garba_new_match', language: 'en' };

describe('Meta WhatsApp client', () => {
  it('posts a template message to the configured version and number, token in the header only', async () => {
    const meta = fakeMeta(accepted());
    const result = await meta.client.sendTemplate(send);

    expect(result).toEqual({ messageId: WAMID });
    expect(meta.calls).toEqual([
      {
        url: `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: '919876543210',
          type: 'template',
          template: { name: 'garba_new_match', language: { code: 'en' } },
        },
      },
    ]);
    expect(meta.calls[0]?.url).not.toContain(TOKEN);
  });

  it('uses whatever Graph API version is configured', async () => {
    const calls: string[] = [];
    const client = createMetaWhatsAppClient({
      accessToken: TOKEN,
      phoneNumberId: PHONE_NUMBER_ID,
      apiVersion: 'v31.0',
      fetchImpl: (url) => {
        calls.push(url);
        return Promise.resolve(new Response(JSON.stringify(accepted().json), { status: 200 }));
      },
    });
    await client.sendTemplate(send);
    expect(calls[0]).toBe(`https://graph.facebook.com/v31.0/${PHONE_NUMBER_ID}/messages`);
  });

  it('a refusal that will not go away is reported once, with its code and reason', async () => {
    const meta = fakeMeta(
      refused(132001, 'Template name does not exist in the translation', 'template not found'),
    );
    const error = await meta.client.sendTemplate(send).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MetaWhatsAppError);
    expect(error).toMatchObject({
      code: 132001,
      retryable: false,
      rateLimited: false,
      message: '[E132001] Template name does not exist in the translation — template not found',
    });
    expect(meta.calls).toHaveLength(1);
    expect(meta.waits).toEqual([]);
  });

  it('retries when Meta says it is throttling, then succeeds', async () => {
    const meta = fakeMeta(refused(130429, 'Rate limit hit', undefined, 429), accepted());
    expect(await meta.client.sendTemplate(send)).toEqual({ messageId: WAMID });
    expect(meta.calls).toHaveLength(2);
    expect(meta.waits).toEqual([400]);
  });

  it('gives up after three tries and says it was rate limited', async () => {
    const meta = fakeMeta(refused(130429, 'Rate limit hit', undefined, 429));
    const error = await meta.client.sendTemplate(send).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 130429, retryable: true, rateLimited: true });
    expect(meta.calls).toHaveLength(3);
    expect(meta.waits).toEqual([400, 1200]);
  });

  it('retries a temporary fault on Meta’s side, including a 5xx without an error body', async () => {
    const unavailable = fakeMeta(
      refused(131016, 'Service unavailable', undefined, 500),
      accepted(),
    );
    await unavailable.client.sendTemplate(send);
    expect(unavailable.calls).toHaveLength(2);

    const gateway = fakeMeta({ status: 502, json: '<html>Bad gateway</html>' }, accepted());
    await gateway.client.sendTemplate(send);
    expect(gateway.calls).toHaveLength(2);
  });

  it('does not retry an expired token, a restricted number or an undeliverable message', async () => {
    for (const [code, text] of [
      [190, 'Access token has expired'],
      [131048, 'Spam rate limit hit'],
      [131026, 'Message undeliverable'],
      [133010, 'Account not registered'],
    ] as const) {
      const meta = fakeMeta(refused(code, text, undefined, code === 190 ? 401 : 400));
      const error = await meta.client.sendTemplate(send).catch((e: unknown) => e);
      expect(error).toMatchObject({ code, retryable: false });
      expect(meta.calls).toHaveLength(1);
    }
  });

  it('never resends after a timeout or network failure (it might already have been accepted)', async () => {
    let calls = 0;
    const timeout = createMetaWhatsAppClient({
      accessToken: TOKEN,
      phoneNumberId: PHONE_NUMBER_ID,
      apiVersion: 'v25.0',
      fetchImpl: () => {
        calls += 1;
        return Promise.reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
      },
    });
    await expect(timeout.sendTemplate(send)).rejects.toThrow('Meta did not answer in time');
    expect(calls).toBe(1);

    const down = createMetaWhatsAppClient({
      accessToken: TOKEN,
      phoneNumberId: PHONE_NUMBER_ID,
      apiVersion: 'v25.0',
      fetchImpl: () =>
        Promise.reject(new TypeError(`fetch failed Bearer ${TOKEN} to 919876543210`)),
    });
    const error = await down.sendTemplate(send).catch((e: unknown) => e);
    // The underlying error text (which could quote the token or number) is not passed on.
    expect((error as Error).message).toBe('Meta could not be reached');
  });

  it('treats an answer without a message ID as a failure', async () => {
    const meta = fakeMeta({ status: 200, json: { messaging_product: 'whatsapp', messages: [] } });
    await expect(meta.client.sendTemplate(send)).rejects.toThrow('without a message ID');
  });
});

describe('notification message (utility template)', () => {
  const logger = pino({ level: 'silent' });
  const env = createTestEnv({
    WHATSAPP_ENABLED: 'true',
    MESSAGING_PROVIDER: 'meta',
    ...META_ENV,
    META_WHATSAPP_TEMPLATES: 'match_created:garba_new_match, booking:garba_pass_update',
  });
  const message = {
    type: 'match_created' as const,
    to: '+919876543210',
    title: 'New match',
    text: 'GarbaMates: you have a new Garba match. Open the app to say hello.',
    reference: 'ref-1:whatsapp',
  };

  it('sends the template mapped to the notification type, with no variables', async () => {
    const meta = fakeMeta(accepted());
    const { sms, whatsapp } = createMessageProviders(env, logger, meta.client);
    expect(sms).toBeNull();
    expect(whatsapp).toMatchObject({ name: 'meta', channel: 'whatsapp' });

    const result = await whatsapp?.send(message);

    expect(meta.calls[0]?.body).toMatchObject({
      to: '919876543210',
      type: 'template',
      template: { name: 'garba_new_match', language: { code: 'en' } },
    });
    expect(JSON.stringify(meta.calls[0]?.body)).not.toContain('components');
    expect(result).toEqual({ providerMessageId: metaMessageRef(WAMID) });
  });

  it('only types with a template are supported; the rest are never sent', async () => {
    const meta = fakeMeta(accepted());
    const { whatsapp } = createMessageProviders(env, logger, meta.client);
    expect(whatsapp?.supports?.('match_created')).toBe(true);
    expect(whatsapp?.supports?.('booking')).toBe(true);
    expect(whatsapp?.supports?.('new_message')).toBe(false);
    await expect(whatsapp?.send({ ...message, type: 'new_message' })).rejects.toThrow(
      'No WhatsApp template',
    );
    expect(meta.calls).toHaveLength(0);
  });

  it('channels that are off have no provider; the log provider stays for development', () => {
    const off = createTestEnv({ MESSAGING_PROVIDER: 'meta', ...META_ENV });
    expect(createMessageProviders(off, logger, fakeMeta().client)).toEqual({
      sms: null,
      whatsapp: null,
    });
    const dev = createMessageProviders(
      createTestEnv({ WHATSAPP_ENABLED: 'true', SMS_ENABLED: 'true' }),
      logger,
    );
    expect(dev.whatsapp?.name).toBe('log');
    expect(dev.sms?.name).toBe('log');
  });

  it('template maps: parses pairs and stops on an unknown notification type', () => {
    expect(parseTemplateMap(' match_created:abc , booking:def_1 ', 'X')).toEqual({
      match_created: 'abc',
      booking: 'def_1',
    });
    expect(parseTemplateMap(undefined, 'X')).toEqual({});
    expect(() => parseTemplateMap('match_made:abc', 'META_WHATSAPP_TEMPLATES')).toThrow(
      /META_WHATSAPP_TEMPLATES: "match_made:abc"/,
    );
  });
});

describe('webhook signature and message reference', () => {
  const secret = META_ENV.META_WHATSAPP_APP_SECRET;
  const body = Buffer.from(
    '{"object":"whatsapp_business_account","entry":[{"id":"1","text":"નમસ્તે"}]}',
  );

  it('accepts only the HMAC of the exact bytes, keyed with the app secret', () => {
    const signature = signMetaBody(body, secret);
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyMetaSignature(body, signature, secret)).toBe(true);
    expect(
      verifyMetaSignature(body, signature.toUpperCase().replace('SHA256', 'sha256'), secret),
    ).toBe(true);

    expect(verifyMetaSignature(Buffer.concat([body, Buffer.from(' ')]), signature, secret)).toBe(
      false,
    );
    expect(verifyMetaSignature(body, signMetaBody(body, 'another-app-secret-000'), secret)).toBe(
      false,
    );
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, '', secret)).toBe(false);
    expect(verifyMetaSignature(body, 'sha1=abcdef', secret)).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=not-hex', secret)).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=abcd', secret)).toBe(false);
  });

  it('the stored reference hides the number that Meta’s ID embeds', () => {
    // A wamid is base64 that contains the recipient number.
    expect(Buffer.from(WAMID.slice('wamid.'.length), 'base64').toString('latin1')).toContain(
      '919876543210',
    );
    const ref = metaMessageRef(WAMID);
    expect(ref).toMatch(/^[0-9a-f]{64}$/);
    expect(ref).toBe(metaMessageRef(WAMID));
    expect(ref).not.toBe(metaMessageRef(`${WAMID}x`));
  });
});

describe('environment rules', () => {
  const base = (extra: Record<string, string>) => () => createTestEnv(extra);

  it('the Meta client exists only when its credentials are set, with sensible defaults', () => {
    const env = createTestEnv({ ...META_ENV });
    expect(env).toMatchObject({
      META_WHATSAPP_API_VERSION: 'v25.0',
      META_WHATSAPP_TEMPLATE_LANGUAGE: 'en',
    });
    expect(createMetaClientFromEnv(env)).not.toBeNull();
    expect(createMetaClientFromEnv(createTestEnv())).toBeNull();
  });

  it('WhatsApp notifications through Meta need the templates and the same credentials', () => {
    const on = { WHATSAPP_ENABLED: 'true', MESSAGING_PROVIDER: 'meta' };
    expect(base(on)).toThrow(/META_WHATSAPP_TEMPLATES[\s\S]*META_WHATSAPP_ACCESS_TOKEN/);
    expect(base({ ...on, ...META_ENV, META_WHATSAPP_TEMPLATES: 'not a map' })).toThrow(
      'META_WHATSAPP_TEMPLATES',
    );
    expect(
      base({ ...on, ...META_ENV, META_WHATSAPP_TEMPLATES: 'booking:garba_pass_update' }),
    ).not.toThrow();
    // Nothing from Meta is needed while WhatsApp is off.
    expect(base({ MESSAGING_PROVIDER: 'meta' })).not.toThrow();
  });

  it('rejects malformed values', () => {
    const ok = { ...META_ENV };
    expect(base({ ...ok, META_WHATSAPP_API_VERSION: '25' })).toThrow('META_WHATSAPP_API_VERSION');
    expect(base({ ...ok, META_WHATSAPP_PHONE_NUMBER_ID: '+918769795033' })).toThrow(
      'META_WHATSAPP_PHONE_NUMBER_ID',
    );
    expect(base({ ...ok, META_WHATSAPP_TEMPLATE_LANGUAGE: 'english' })).toThrow(
      'META_WHATSAPP_TEMPLATE_LANGUAGE',
    );
  });

  it('login no longer depends on Meta: the retired login-code settings are ignored', () => {
    // Sign-in is Firebase Phone Authentication. A leftover line in an old .env must not stop
    // the server, and must not switch anything on.
    const env = createTestEnv({
      OTP_PROVIDER: 'meta_whatsapp',
      LOG_OTP: 'true',
      META_WHATSAPP_OTP_TEMPLATE: 'garbamates_login_code',
    });
    expect(env).not.toHaveProperty('OTP_PROVIDER');
    expect(env).not.toHaveProperty('LOG_OTP');
    expect(env).not.toHaveProperty('META_WHATSAPP_OTP_TEMPLATE');
    expect(createMetaClientFromEnv(env)).toBeNull();
  });

  it('production: needs the Firebase project, and Meta only when WhatsApp is on', () => {
    const production = {
      NODE_ENV: 'production',
      APP_ENV: 'production',
      DATABASE_URL: 'postgres://unused@127.0.0.1:5432/unused',
      FIREBASE_PROJECT_ID: 'garbamates',
      PHONE_HASH_SECRET: 'test-phone-hash-secret-000000000000000000',
      PHONE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      OTP_HMAC_SECRET: 'test-otp-hmac-secret-0000000000000000000000',
      JWT_ACCESS_SECRET: 'test-member-jwt-secret-000000000000000000000',
      JWT_ADMIN_ACCESS_SECRET: 'test-admin-jwt-secret-0000000000000000000000',
      WEB_ORIGIN: 'https://example.in',
      ADMIN_ORIGIN: 'https://admin.example.in',
      MEDIA_STORAGE: 'cloudinary',
      CLOUDINARY_CLOUD_NAME: 'x',
      CLOUDINARY_API_KEY: 'x',
      CLOUDINARY_API_SECRET: 'x',
    };
    // No Meta settings at all: sign-in works without them.
    expect(loadServerEnv({ source: { ...production } })).toMatchObject({
      FIREBASE_PROJECT_ID: 'garbamates',
      WHATSAPP_ENABLED: false,
    });
    const { FIREBASE_PROJECT_ID: _omitted, ...withoutFirebase } = production;
    expect(() => loadServerEnv({ source: withoutFirebase })).toThrow('FIREBASE_PROJECT_ID');
    expect(() =>
      loadServerEnv({ source: { ...production, FIREBASE_PROJECT_ID: 'Not A Project' } }),
    ).toThrow('FIREBASE_PROJECT_ID');
    expect(() => loadServerEnv({ source: { ...production, SMS_ENABLED: 'true' } })).toThrow(
      'SMS_ENABLED',
    );
    expect(() =>
      loadServerEnv({
        source: {
          ...production,
          ...META_ENV,
          WHATSAPP_ENABLED: 'true',
          MESSAGING_PROVIDER: 'meta',
          META_WHATSAPP_TEMPLATES: 'match_created:garba_new_match',
        },
      }),
    ).not.toThrow();
  });
});
