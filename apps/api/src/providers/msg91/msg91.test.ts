import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { loadServerEnv } from '@garba-partner/config/server';
import { createTestEnv } from '../../test/helpers.js';
import { createMessageProviders } from '../messaging/index.js';
import { parseTemplateMap } from '../messaging/msg91.provider.js';
import { createSmsProvider } from '../sms/index.js';
import { createMsg91SmsProvider } from '../sms/msg91.sms.js';
import { MSG91_FLOW_URL, MSG91_WHATSAPP_URL, Msg91Error, type FetchLike } from './client.js';

const AUTH_KEY = 'test-msg91-auth-key-0000';

interface Call {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Stands in for MSG91: records each request and answers with the given status and JSON. */
function fakeMsg91(
  status = 200,
  json: unknown = { type: 'success', message: '3763646c3058373530393938' },
) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string) as unknown,
    });
    return Promise.resolve(
      new Response(typeof json === 'string' ? json : JSON.stringify(json), { status }),
    );
  };
  return { calls, fetchImpl };
}

const logger = pino({ level: 'silent' });
const message = {
  type: 'match_created' as const,
  to: '+919876543210',
  title: 'New match',
  text: 'GarbaMates: you have a new Garba match. Open the app to say hello.',
  reference: 'ref-1:sms',
};

// The `msg91` (SMS) option is switched off, so it cannot be selected through the environment.
// The adapter is kept and still tested here, built directly, so SMS can be switched back on.
describe('MSG91 login-code SMS (switched off; adapter kept)', () => {
  const smsVia = (fetchImpl: FetchLike) =>
    createMsg91SmsProvider({ authKey: AUTH_KEY, otpTemplateId: 'otp_template_0001', fetchImpl });

  it('sends the code through the Flow API and never returns it to the client', async () => {
    const msg91 = fakeMsg91();
    const sms = smsVia(msg91.fetchImpl);
    expect(sms).toMatchObject({ name: 'msg91', exposesCodeInResponse: false });

    await sms.sendOtp('+919876543210', '482913');

    expect(msg91.calls).toEqual([
      {
        url: MSG91_FLOW_URL,
        headers: {
          authkey: AUTH_KEY,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: {
          template_id: 'otp_template_0001',
          short_url: '0',
          realTimeResponse: '1',
          recipients: [{ mobiles: '919876543210', otp: '482913' }],
        },
      },
    ]);
    // The key is a header, never part of the URL.
    expect(msg91.calls[0]?.url).not.toContain(AUTH_KEY);
  });

  it('rejects when MSG91 refuses, including refusals sent with HTTP 200', async () => {
    const refused = smsVia(
      fakeMsg91(200, { type: 'error', message: 'Invalid template' }).fetchImpl,
    );
    await expect(refused.sendOtp('+919876543210', '482913')).rejects.toThrow('Invalid template');

    // What MSG91 really answers for a wrong key (HTTP 200).
    const wrongKey = smsVia(
      fakeMsg91(200, { message: 'Invalid authkey or Token', type: 'error' }).fetchImpl,
    );
    await expect(wrongKey.sendOtp('+919876543210', '482913')).rejects.toThrow(
      'Invalid authkey or Token',
    );

    const unauthorised = smsVia(
      fakeMsg91(401, { type: 'error', message: 'Authentication failure' }).fetchImpl,
    );
    await expect(unauthorised.sendOtp('+919876543210', '482913')).rejects.toBeInstanceOf(
      Msg91Error,
    );

    const htmlError = smsVia(fakeMsg91(502, '<html>Bad gateway</html>').fetchImpl);
    await expect(htmlError.sendOtp('+919876543210', '482913')).rejects.toThrow(
      'MSG91 answered HTTP 502',
    );
  });

  it('reports a network failure or timeout without leaking the key or the number', async () => {
    const down: FetchLike = () =>
      Promise.reject(new TypeError(`connect ECONNREFUSED authkey=${AUTH_KEY}`));
    const error = await smsVia(down)
      .sendOtp('+919876543210', '482913')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Msg91Error);
    expect((error as Error).message).toBe('MSG91 could not be reached');

    const slow: FetchLike = () =>
      Promise.reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    await expect(smsVia(slow).sendOtp('+919876543210', '482913')).rejects.toThrow(
      'MSG91 did not answer in time',
    );
  });
});

describe('MSG91 login codes on WhatsApp', () => {
  const env = createTestEnv({
    SMS_PROVIDER: 'msg91_whatsapp',
    MSG91_AUTH_KEY: AUTH_KEY,
    MSG91_WHATSAPP_NUMBER: '+919000000001',
    MSG91_WHATSAPP_OTP_TEMPLATE: 'garbamates_login_code',
  });

  it('sends the code in the approved template, in the body and the copy-code button', async () => {
    const msg91 = fakeMsg91(200, { status: 'success', hasError: false, data: 'ok' });
    const provider = createSmsProvider(env, msg91.fetchImpl);
    expect(provider).toMatchObject({ name: 'msg91_whatsapp', exposesCodeInResponse: false });

    await provider.sendOtp('+919876543210', '482913');

    expect(msg91.calls).toEqual([
      {
        url: MSG91_WHATSAPP_URL,
        headers: {
          authkey: AUTH_KEY,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: {
          integrated_number: '919000000001',
          content_type: 'template',
          payload: {
            messaging_product: 'whatsapp',
            type: 'template',
            template: {
              name: 'garbamates_login_code',
              language: { code: 'en', policy: 'deterministic' },
              to_and_components: [
                {
                  to: ['919876543210'],
                  components: {
                    body_1: { type: 'text', value: '482913' },
                    button_1: { subtype: 'url', type: 'text', value: '482913' },
                  },
                },
              ],
            },
          },
        },
      },
    ]);
    expect(msg91.calls[0]?.url).not.toContain(AUTH_KEY);
  });

  it('leaves the button out for a template without one, and adds the namespace when set', async () => {
    const msg91 = fakeMsg91(200, { status: 'success', hasError: false });
    const plain = createTestEnv({
      SMS_PROVIDER: 'msg91_whatsapp',
      MSG91_AUTH_KEY: AUTH_KEY,
      MSG91_WHATSAPP_NUMBER: '919000000001',
      MSG91_WHATSAPP_OTP_TEMPLATE: 'garbamates_login_code',
      MSG91_WHATSAPP_OTP_COPY_BUTTON: 'false',
      MSG91_WHATSAPP_NAMESPACE: 'ns_123',
      MSG91_WHATSAPP_LANGUAGE: 'en_US',
    });
    await createSmsProvider(plain, msg91.fetchImpl).sendOtp('+919876543210', '482913');
    expect(msg91.calls[0]?.body).toMatchObject({
      payload: {
        template: {
          namespace: 'ns_123',
          language: { code: 'en_US' },
          to_and_components: [{ components: { body_1: { type: 'text', value: '482913' } } }],
        },
      },
    });
    expect(JSON.stringify(msg91.calls[0]?.body)).not.toContain('button_1');
  });

  it('rejects when MSG91 refuses: wrong key (HTTP 401) or a template problem', async () => {
    // What MSG91 really answers for a wrong key on this endpoint.
    const wrongKey = fakeMsg91(401, {
      status: 'fail',
      hasError: true,
      errors: 'Unauthorized',
      code: '401',
    });
    await expect(
      createSmsProvider(env, wrongKey.fetchImpl).sendOtp('+919876543210', '482913'),
    ).rejects.toThrow('Unauthorized');

    const badTemplate = fakeMsg91(200, {
      status: 'fail',
      hasError: true,
      errors: 'Template not approved',
    });
    await expect(
      createSmsProvider(env, badTemplate.fetchImpl).sendOtp('+919876543210', '482913'),
    ).rejects.toBeInstanceOf(Msg91Error);
  });
});

describe('MSG91 notification channels', () => {
  const env = createTestEnv({
    SMS_ENABLED: 'true',
    WHATSAPP_ENABLED: 'true',
    MESSAGING_PROVIDER: 'msg91',
    MSG91_AUTH_KEY: AUTH_KEY,
    MSG91_SMS_TEMPLATE_IDS: 'match_created:sms_match_01, interest_received:sms_interest_01',
    MSG91_WHATSAPP_NUMBER: '+919000000001',
    MSG91_WHATSAPP_TEMPLATES: 'match_created:garba_new_match',
    MSG91_WHATSAPP_LANGUAGE: 'en',
  });

  it('SMS: sends the template mapped to the notification type', async () => {
    const msg91 = fakeMsg91();
    const { sms } = createMessageProviders(env, logger, msg91.fetchImpl);
    expect(sms).toMatchObject({ name: 'msg91', channel: 'sms' });

    const result = await sms?.send(message);

    expect(result).toEqual({ providerMessageId: '3763646c3058373530393938' });
    expect(msg91.calls[0]).toMatchObject({
      url: MSG91_FLOW_URL,
      body: {
        template_id: 'sms_match_01',
        short_url: '0',
        realTimeResponse: '1',
        recipients: [{ mobiles: '919876543210' }],
      },
    });
    expect(msg91.calls[0]?.headers.authkey).toBe(AUTH_KEY);
  });

  it('only types with a template are supported; others are not attempted', async () => {
    const msg91 = fakeMsg91();
    const { sms, whatsapp } = createMessageProviders(env, logger, msg91.fetchImpl);
    expect(sms?.supports?.('match_created')).toBe(true);
    expect(sms?.supports?.('interest_received')).toBe(true);
    expect(sms?.supports?.('new_message')).toBe(false);
    expect(whatsapp?.supports?.('match_created')).toBe(true);
    expect(whatsapp?.supports?.('interest_received')).toBe(false);
    await expect(sms?.send({ ...message, type: 'new_message' })).rejects.toThrow(
      'No MSG91 SMS template',
    );
    expect(msg91.calls).toHaveLength(0);
  });

  it('WhatsApp: sends the approved template from the connected number', async () => {
    const msg91 = fakeMsg91(200, {
      status: 'success',
      hasError: false,
      data: { message_uuid: 'wa-uuid-1' },
    });
    const { whatsapp } = createMessageProviders(env, logger, msg91.fetchImpl);

    const result = await whatsapp?.send(message);

    expect(result).toEqual({ providerMessageId: 'wa-uuid-1' });
    expect(msg91.calls[0]).toEqual({
      url: MSG91_WHATSAPP_URL,
      headers: {
        authkey: AUTH_KEY,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: {
        integrated_number: '919000000001',
        content_type: 'template',
        payload: {
          messaging_product: 'whatsapp',
          type: 'template',
          template: {
            name: 'garba_new_match',
            language: { code: 'en', policy: 'deterministic' },
            to_and_components: [{ to: ['919876543210'], components: {} }],
          },
        },
      },
    });
  });

  it('WhatsApp: a refusal flagged in the body is a failure', async () => {
    const msg91 = fakeMsg91(200, {
      status: 'fail',
      hasError: true,
      errors: 'Template not approved',
    });
    const { whatsapp } = createMessageProviders(env, logger, msg91.fetchImpl);
    await expect(whatsapp?.send(message)).rejects.toThrow('Template not approved');
  });

  it('includes the namespace only when one is configured', async () => {
    const msg91 = fakeMsg91();
    const withNamespace = createTestEnv({
      WHATSAPP_ENABLED: 'true',
      MESSAGING_PROVIDER: 'msg91',
      MSG91_AUTH_KEY: AUTH_KEY,
      MSG91_WHATSAPP_NUMBER: '919000000001',
      MSG91_WHATSAPP_TEMPLATES: 'match_created:garba_new_match',
      MSG91_WHATSAPP_NAMESPACE: 'ns_123',
    });
    await createMessageProviders(withNamespace, logger, msg91.fetchImpl).whatsapp?.send(message);
    expect(msg91.calls[0]?.body).toMatchObject({
      payload: { template: { namespace: 'ns_123' } },
    });
  });

  it('a channel that is switched off has no provider', () => {
    const off = createTestEnv({ MESSAGING_PROVIDER: 'msg91', MSG91_AUTH_KEY: AUTH_KEY });
    expect(createMessageProviders(off, logger)).toEqual({ sms: null, whatsapp: null });
  });
});

describe('template maps', () => {
  it('parses type:template pairs', () => {
    expect(parseTemplateMap(' match_created:abc , booking:def-1 ', 'X')).toEqual({
      match_created: 'abc',
      booking: 'def-1',
    });
    expect(parseTemplateMap(undefined, 'X')).toEqual({});
  });

  it('stops on an unknown notification type', () => {
    expect(() => parseTemplateMap('match_made:abc', 'MSG91_SMS_TEMPLATE_IDS')).toThrow(
      /MSG91_SMS_TEMPLATE_IDS: "match_made:abc"/,
    );
  });
});

describe('MSG91 environment rules', () => {
  const base = (extra: Record<string, string>) => () => createTestEnv(extra);

  it('SMS_PROVIDER=msg91_whatsapp needs the auth key, the WhatsApp number and the template', () => {
    expect(base({ SMS_PROVIDER: 'msg91_whatsapp' })).toThrow(
      /MSG91_AUTH_KEY[\s\S]*MSG91_WHATSAPP_NUMBER[\s\S]*MSG91_WHATSAPP_OTP_TEMPLATE/,
    );
    expect(
      base({
        SMS_PROVIDER: 'msg91_whatsapp',
        MSG91_AUTH_KEY: AUTH_KEY,
        MSG91_WHATSAPP_NUMBER: '919000000001',
      }),
    ).toThrow('MSG91_WHATSAPP_OTP_TEMPLATE');
    expect(
      base({
        SMS_PROVIDER: 'msg91_whatsapp',
        MSG91_AUTH_KEY: AUTH_KEY,
        MSG91_WHATSAPP_NUMBER: '919000000001',
        MSG91_WHATSAPP_OTP_TEMPLATE: 'Not A Template Name',
      }),
    ).toThrow('MSG91_WHATSAPP_OTP_TEMPLATE');
    expect(
      base({
        SMS_PROVIDER: 'msg91_whatsapp',
        MSG91_AUTH_KEY: AUTH_KEY,
        MSG91_WHATSAPP_NUMBER: '919000000001',
        MSG91_WHATSAPP_OTP_TEMPLATE: 'garbamates_login_code',
      }),
    ).not.toThrow();
  });

  it('the SMS login-code option is switched off: SMS_PROVIDER=msg91 is refused', () => {
    expect(
      base({
        SMS_PROVIDER: 'msg91',
        MSG91_AUTH_KEY: AUTH_KEY,
        MSG91_OTP_TEMPLATE_ID: 'otp_template_0001',
      }),
    ).toThrow('SMS_PROVIDER');
  });

  it('MESSAGING_PROVIDER=msg91 needs what each enabled channel uses', () => {
    expect(base({ MESSAGING_PROVIDER: 'msg91' })).toThrow('MSG91_AUTH_KEY');
    const on = { MESSAGING_PROVIDER: 'msg91', MSG91_AUTH_KEY: AUTH_KEY };
    expect(base({ ...on, SMS_ENABLED: 'true' })).toThrow('MSG91_SMS_TEMPLATE_IDS');
    expect(base({ ...on, WHATSAPP_ENABLED: 'true' })).toThrow(
      /MSG91_WHATSAPP_NUMBER[\s\S]*MSG91_WHATSAPP_TEMPLATES/,
    );
    expect(base({ ...on, SMS_ENABLED: 'true', MSG91_SMS_TEMPLATE_IDS: 'not a map' })).toThrow(
      'MSG91_SMS_TEMPLATE_IDS',
    );
    expect(base(on)).not.toThrow();
  });

  it('production accepts WhatsApp login codes and both channels, and still refuses "dev" and "log"', () => {
    const production = {
      NODE_ENV: 'production',
      APP_ENV: 'production',
      DATABASE_URL: 'postgres://unused@127.0.0.1:5432/unused',
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
      SMS_PROVIDER: 'msg91_whatsapp',
      MSG91_AUTH_KEY: AUTH_KEY,
      MSG91_WHATSAPP_NUMBER: '919000000001',
      MSG91_WHATSAPP_OTP_TEMPLATE: 'garbamates_login_code',
    };
    const env = loadServerEnv({ source: { ...production } });
    expect(env).toMatchObject({
      SMS_PROVIDER: 'msg91_whatsapp',
      SMS_ENABLED: false,
      MESSAGING_PROVIDER: 'log',
    });

    expect(() => loadServerEnv({ source: { ...production, SMS_PROVIDER: 'dev' } })).toThrow(
      'SMS_PROVIDER',
    );
    expect(() => loadServerEnv({ source: { ...production, SMS_ENABLED: 'true' } })).toThrow(
      'SMS_ENABLED',
    );
    expect(() =>
      loadServerEnv({
        source: {
          ...production,
          SMS_ENABLED: 'true',
          WHATSAPP_ENABLED: 'true',
          MESSAGING_PROVIDER: 'msg91',
          MSG91_SMS_TEMPLATE_IDS: 'match_created:sms_match_01',
          MSG91_WHATSAPP_NUMBER: '919000000001',
          MSG91_WHATSAPP_TEMPLATES: 'match_created:garba_new_match',
        },
      }),
    ).not.toThrow();
  });
});
