import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The one place that talks to the Meta WhatsApp Cloud API (docs/notifications/meta-whatsapp.md).
 * Everything else (login codes, notifications) goes through `sendTemplate`.
 *
 * - Only approved template messages are sent: a business cannot start a conversation with free
 *   text, and login codes must use an "Authentication" template.
 * - The access token travels only in the `Authorization` header. It is never put in a URL, an
 *   error message or a log line.
 * - The Graph API version comes from configuration (`META_WHATSAPP_API_VERSION`).
 */

const GRAPH_HOST = 'https://graph.facebook.com';
const TIMEOUT_MS = 8000;
/** Waits before the 2nd and 3rd attempt. */
const BACKOFF_MS = [400, 1200];

/** `fetch`, injectable so tests never call Meta. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Meta error codes that mean "try again shortly": throttling (4, 80007, 130429, 131056) and
 * temporary trouble on Meta's side (2, 131000, 131016).
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
const RETRYABLE_CODES = new Set([2, 4, 80007, 130429, 131000, 131016, 131056]);
const RATE_LIMIT_CODES = new Set([4, 80007, 130429, 131056]);

/** Meta refused the message, or could not be reached. `message` is safe to store and log. */
export class MetaWhatsAppError extends Error {
  /** Meta's error code, or null when Meta never answered (network failure, timeout). */
  readonly code: number | null;
  readonly retryable: boolean;
  readonly rateLimited: boolean;

  constructor(message: string, code: number | null, retryable: boolean) {
    super(message);
    this.name = 'MetaWhatsAppError';
    this.code = code;
    this.retryable = retryable;
    this.rateLimited = code !== null && RATE_LIMIT_CODES.has(code);
  }
}

/** One `{{n}}` value or button value of a template, in Meta's shape. */
export type TemplateComponent =
  | { type: 'body'; parameters: { type: 'text'; text: string }[] }
  | {
      type: 'button';
      sub_type: 'url';
      index: string;
      parameters: { type: 'text'; text: string }[];
    };

export interface SendTemplateInput {
  /** Recipient in E.164 (`+919876543210`). Never logged. */
  to: string;
  /** Name of an approved template. */
  template: string;
  /** Language code the template was approved in (`en`, `en_US`, …). */
  language: string;
  components?: TemplateComponent[];
}

export interface MetaWhatsAppClient {
  /**
   * Sends one template message. Resolves with Meta's message ID (`wamid…`) once Meta has
   * ACCEPTED it; that is not delivery, which is reported later through the webhook.
   * Rejects with {@link MetaWhatsAppError}.
   */
  sendTemplate(input: SendTemplateInput): Promise<{ messageId: string }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * What we store and log instead of Meta's message ID. A `wamid` is base64 that embeds the
 * recipient's phone number, and this application never stores numbers in readable form. The
 * hash is all that is needed to match a delivery report to the message it is about.
 */
export function metaMessageRef(messageId: string): string {
  return createHash('sha256').update(messageId, 'utf8').digest('hex');
}

/** `+919876543210` → `919876543210` (Meta takes the number without the plus sign). */
export function toWhatsAppNumber(e164: string): string {
  return e164.replace(/\D/g, '');
}

/** Builds the error for a refusal. Meta's own text is kept: it names the cause, never a secret. */
function refusal(status: number, body: unknown): MetaWhatsAppError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const code = typeof error.code === 'number' ? error.code : null;
  const data = isRecord(error.error_data) ? error.error_data : {};
  const details = typeof data.details === 'string' ? data.details : null;
  const title = typeof error.message === 'string' ? error.message : null;
  // `[E131026] Message undeliverable — …`: the code survives the digit masking applied to
  // stored error text (a bare number would be masked as if it were a phone number).
  const text = [title?.replace(/^\(#\d+\)\s*/, ''), details].filter(Boolean).join(' — ');
  const message = `${code !== null ? `[E${String(code)}] ` : ''}${text || `Meta answered HTTP ${String(status)}`}`;
  const retryable = code !== null ? RETRYABLE_CODES.has(code) : status >= 500 || status === 429;
  return new MetaWhatsAppError(message, code, retryable);
}

export function createMetaWhatsAppClient(options: {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  fetchImpl?: FetchLike;
  /** Replaced in tests so retries do not really wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Total tries for one message, including the first. Default 3. */
  maxAttempts?: number;
}): MetaWhatsAppClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = options.maxAttempts ?? 3;
  const url = `${GRAPH_HOST}/${options.apiVersion}/${options.phoneNumberId}/messages`;

  async function attempt(input: SendTemplateInput): Promise<{ messageId: string }> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toWhatsAppNumber(input.to),
          type: 'template',
          template: {
            name: input.template,
            language: { code: input.language },
            ...(input.components && input.components.length > 0
              ? { components: input.components }
              : {}),
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // No answer from Meta. NOT retried: the message may already have been accepted, and
      // sending it again could deliver it twice.
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      throw new MetaWhatsAppError(
        timedOut ? 'Meta did not answer in time' : 'Meta could not be reached',
        null,
        false,
      );
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON (e.g. a gateway error page): judged by the status code alone.
    }
    if (!response.ok || (isRecord(body) && body.error !== undefined)) {
      throw refusal(response.status, body);
    }
    const messages = isRecord(body) && Array.isArray(body.messages) ? body.messages : [];
    const first: unknown = messages[0];
    const id = isRecord(first) && typeof first.id === 'string' ? first.id : null;
    if (!id)
      throw new MetaWhatsAppError('Meta accepted the request without a message ID', null, false);
    return { messageId: id };
  }

  return {
    async sendTemplate(input) {
      for (let tries = 1; ; tries += 1) {
        try {
          return await attempt(input);
        } catch (err) {
          // Retried only when Meta itself said "not sent, try again" (throttling, a temporary
          // fault): then nothing was delivered and a second send cannot duplicate it.
          const retry = err instanceof MetaWhatsAppError && err.retryable && tries < maxAttempts;
          if (!retry) throw err;
          await sleep(BACKOFF_MS[tries - 1] ?? 2000);
        }
      }
    },
  };
}

/**
 * True when `signatureHeader` (`X-Hub-Signature-256: sha256=<hex>`) is the HMAC-SHA256 of the
 * exact bytes Meta sent, keyed with the app secret. Compared in constant time.
 */
export function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const given = signatureHeader.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(given, 'hex'));
}

/** The signature Meta would send for `rawBody` (used by tests). */
export function signMetaBody(rawBody: string | Buffer, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}
