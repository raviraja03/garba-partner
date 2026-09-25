import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptString, encryptString, hashPhone } from './crypto.js';

const HASH_SECRET = 'test-secret-that-is-at-least-32-characters-long';
const KEY = randomBytes(32).toString('base64');

describe('hashPhone', () => {
  it('is deterministic 64-char hex and never contains the number', () => {
    const hash = hashPhone('+919999900001', HASH_SECRET);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPhone('+919999900001', HASH_SECRET)).toBe(hash);
    expect(hash).not.toContain('9999900001');
  });

  it('depends on the secret and the number', () => {
    const hash = hashPhone('+919999900001', HASH_SECRET);

    expect(hashPhone('+919999900002', HASH_SECRET)).not.toBe(hash);
    expect(hashPhone('+919999900001', `${HASH_SECRET}-other`)).not.toBe(hash);
  });

  it('rejects numbers that are not E.164', () => {
    expect(() => hashPhone('9999900001', HASH_SECRET)).toThrow(/E\.164/);
    expect(() => hashPhone('+91 99999 00001', HASH_SECRET)).toThrow(/E\.164/);
  });
});

describe('encryptString / decryptString', () => {
  it('round-trips and uses a random IV per encryption', () => {
    const first = encryptString('+919999900001', KEY);
    const second = encryptString('+919999900001', KEY);

    expect(first).not.toBe(second);
    expect(decryptString(first, KEY)).toBe('+919999900001');
    expect(decryptString(second, KEY)).toBe('+919999900001');
  });

  it('detects tampering and wrong keys', () => {
    const payload = Buffer.from(encryptString('+919999900001', KEY), 'base64');
    payload[payload.length - 1] = (payload.at(-1) ?? 0) ^ 0xff;

    expect(() => decryptString(payload.toString('base64'), KEY)).toThrow();
    expect(() =>
      decryptString(encryptString('+919999900001', KEY), randomBytes(32).toString('base64')),
    ).toThrow();
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => encryptString('x', randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
