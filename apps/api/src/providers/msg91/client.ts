/**
 * Minimal MSG91 HTTP client (docs/notifications/msg91.md). Two endpoints are used:
 *
 * - Flow API: sends one SMS from a DLT-approved template stored in MSG91.
 * - WhatsApp bulk outbound API: sends one approved WhatsApp template message.
 *
 * The auth key travels only in the `authkey` request header. It is never put in a URL, an error
 * message or a log line.
 */

export const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow';
export const MSG91_WHATSAPP_URL =
  'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/';

/**
 * Added to every Flow request. Without it MSG91 queues the request and answers "success" even
 * for a wrong auth key or template; with it MSG91 checks the request first and answers with the
 * real error. (Found by calling MSG91 with an invalid key.)
 */
export const MSG91_FLOW_OPTIONS = { short_url: '0', realTimeResponse: '1' } as const;

const TIMEOUT_MS = 10_000;

/** `fetch`, injectable so tests never call MSG91. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** MSG91 refused the message, or could not be reached. The message is safe to store and log. */
export class Msg91Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Msg91Error';
  }
}

/** `+919876543210` → `919876543210` (MSG91 wants the country code without the plus sign). */
export function toMsg91Mobile(e164: string): string {
  return e164.replace(/\D/g, '');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * MSG91 answers failures in more than one shape, sometimes with HTTP 200:
 * `{"type":"error","message":"…"}` (SMS) or `{"status":"fail","hasError":true,"errors":…}`
 * (WhatsApp). Anything that is not clearly a success is treated as a failure.
 */
function failureOf(status: number, body: unknown): string | null {
  const record = isRecord(body) ? body : {};
  const flagged =
    record.type === 'error' ||
    record.status === 'fail' ||
    record.status === 'error' ||
    record.hasError === true;
  if (status >= 200 && status < 300 && !flagged) return null;
  const detail = [record.message, record.errors, record.error].find(
    (value) => typeof value === 'string' && value.length > 0,
  );
  return typeof detail === 'string' ? detail : `MSG91 answered HTTP ${String(status)}`;
}

/** The ID MSG91 gives the request: `message` for SMS, `request_id` / `data.*` for WhatsApp. */
function messageIdOf(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const data = isRecord(body.data) ? body.data : {};
  const candidates = [body.request_id, data.request_id, data.message_uuid, data.id, body.message];
  const id = candidates.find((value) => typeof value === 'string' && value.length > 0);
  return typeof id === 'string' ? id.slice(0, 120) : null;
}

/**
 * POSTs JSON to MSG91. Resolves with MSG91's ID for the request when it was accepted; rejects
 * with {@link Msg91Error} on a refusal, a timeout or a network failure.
 */
export async function msg91Post(
  url: string,
  authKey: string,
  body: unknown,
  fetchImpl: FetchLike = fetch,
): Promise<{ providerMessageId: string | null }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { authkey: authKey, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new Msg91Error(timedOut ? 'MSG91 did not answer in time' : 'MSG91 could not be reached');
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // Not JSON (e.g. an HTML error page): judged by the status code alone.
  }
  const failure = failureOf(response.status, parsed);
  if (failure) throw new Msg91Error(failure);
  return { providerMessageId: messageIdOf(parsed) };
}
