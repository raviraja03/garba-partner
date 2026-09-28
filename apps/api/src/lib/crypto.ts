import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const AES_ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/** HMAC-SHA256 as lowercase hex (64 characters). */
export function hmacSha256Hex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

/**
 * Keyed hash used to look up a user by phone number without storing the number in plaintext.
 * Expects a normalised E.164 number (normalisation happens in the auth phase).
 */
export function hashPhone(e164: string, secret: string): string {
  if (!E164_PATTERN.test(e164)) throw new Error('Phone number must be in E.164 format');
  return hmacSha256Hex(secret, e164);
}

function decodeKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
  return key;
}

/** AES-256-GCM encryption. Output: base64(iv ‖ authTag ‖ ciphertext). */
export function encryptString(plaintext: string, base64Key: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, decodeKey(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/** Reverses {@link encryptString}. Throws if the payload was tampered with or the key is wrong. */
export function decryptString(payload: string, base64Key: string): string {
  const data = Buffer.from(payload, 'base64');
  if (data.length <= IV_BYTES + AUTH_TAG_BYTES) throw new Error('Encrypted payload is too short');

  const iv = data.subarray(0, IV_BYTES);
  const authTag = data.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = data.subarray(IV_BYTES + AUTH_TAG_BYTES);

  const decipher = createDecipheriv(AES_ALGORITHM, decodeKey(base64Key), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** SHA-256 as lowercase hex (used for refresh tokens, which are already high-entropy). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Cryptographically random, URL-safe token (default 32 bytes = 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Uniformly random numeric code, zero-padded (e.g. a 6-digit OTP). */
export function randomNumericCode(length: number): string {
  return randomInt(0, 10 ** length)
    .toString()
    .padStart(length, '0');
}

/** Constant-time comparison of two hex digests. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
