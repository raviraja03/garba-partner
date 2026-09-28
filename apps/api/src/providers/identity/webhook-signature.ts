import type { IncomingHttpHeaders } from 'node:http';
import { LIMITS } from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { hmacSha256Hex, timingSafeEqualHex } from '../../lib/crypto.js';

export const SIGNATURE_HEADER = 'x-verification-signature';
export const TIMESTAMP_HEADER = 'x-verification-timestamp';

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Signature scheme: `X-Verification-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>`
 * with `X-Verification-Timestamp: <unix seconds>`. Signing the timestamp and rejecting stale
 * requests (±5 minutes) prevents replaying captured callbacks.
 */
export function signWebhook(secret: string, rawBody: string, timestamp: number): string {
  return `sha256=${hmacSha256Hex(secret, `${String(timestamp)}.${rawBody}`)}`;
}

export function verifyWebhookSignature(
  secret: string,
  rawBody: Buffer,
  headers: IncomingHttpHeaders,
  now: number = Date.now(),
): void {
  const invalid = () => new AppError('UNAUTHENTICATED', { message: 'Invalid webhook signature.' });

  const timestampHeader = header(headers, TIMESTAMP_HEADER);
  const signatureHeader = header(headers, SIGNATURE_HEADER);
  if (!timestampHeader || !signatureHeader || !/^\d{1,12}$/.test(timestampHeader)) throw invalid();

  const timestamp = Number(timestampHeader);
  if (Math.abs(now / 1000 - timestamp) > LIMITS.VERIFICATION_WEBHOOK_TOLERANCE_SECONDS) throw invalid();

  const match = /^sha256=([0-9a-f]{64})$/.exec(signatureHeader);
  const expected = hmacSha256Hex(secret, `${timestampHeader}.${rawBody.toString('utf8')}`);
  if (!match?.[1] || !timingSafeEqualHex(match[1], expected)) throw invalid();
}
