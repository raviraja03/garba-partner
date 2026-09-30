import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time passwords (RFC 6238, HMAC-SHA1, 30-second steps, 6 digits), compatible
 * with Google Authenticator, Microsoft Authenticator, 1Password, etc. Used for mandatory admin
 * two-factor sign-in (docs/security/security-best-practices.md#admin-two-factor-sign-in).
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 input');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new random 160-bit secret, base32-encoded. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The time step for an instant. */
export function totpStep(now: number = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

/** The code for a given step (HOTP, RFC 4226 dynamic truncation). */
export function totpCode(secret: string, step: number, digits: number = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    ((hmac[offset + 1] ?? 0) << 16) |
    ((hmac[offset + 2] ?? 0) << 8) |
    (hmac[offset + 3] ?? 0);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Checks a code against the current step ±1 (clock drift). Returns the matching step, or null.
 * Steps at or before `lastUsedStep` are refused, so a code can never be replayed.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: { now?: number; lastUsedStep?: number | null } = {},
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(options.now);
  for (const step of [current - 1, current, current + 1]) {
    if (
      options.lastUsedStep !== null &&
      options.lastUsedStep !== undefined &&
      step <= options.lastUsedStep
    ) {
      continue;
    }
    const expected = Buffer.from(totpCode(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

/**
 * `otpauth://` URI for authenticator apps (manual entry or QR). Percent-encoded throughout
 * (`%20`, not `+`): several authenticator apps show a `+` in the issuer literally.
 */
export function otpauthUri(options: { issuer: string; account: string; secret: string }): string {
  const label = encodeURIComponent(`${options.issuer}:${options.account}`);
  const params: [string, string][] = [
    ['secret', options.secret],
    ['issuer', options.issuer],
    ['algorithm', 'SHA1'],
    ['digits', String(DIGITS)],
    ['period', String(STEP_SECONDS)],
  ];
  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return `otpauth://totp/${label}?${query}`;
}
