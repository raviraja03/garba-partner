import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  totpCode,
  totpStep,
  verifyTotp,
} from './totp.js';

// RFC 6238 Appendix B test secret ("12345678901234567890", SHA-1).
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('matches the RFC vector at t=%i', (seconds, expected) => {
    expect(totpCode(RFC_SECRET, totpStep(seconds * 1000), 8)).toBe(expected);
  });

  it('round-trips base32 and generates 160-bit secrets', () => {
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(() => base32Decode('not base32!')).toThrow();
  });

  it('accepts the current step ±1 and refuses replays and malformed codes', () => {
    const secret = generateTotpSecret();
    const now = 1_760_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(secret, totpCode(secret, step), { now })).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step + 1), { now })).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, step - 2), { now })).toBeNull();
    // Replay: a code for a step already used is refused.
    expect(verifyTotp(secret, totpCode(secret, step), { now, lastUsedStep: step })).toBeNull();
    for (const bad of ['', '12345', '1234567', 'abcdef', ' 12345']) {
      expect(verifyTotp(secret, bad, { now })).toBeNull();
    }
  });

  it('builds otpauth URIs for authenticator apps', () => {
    expect(otpauthUri({ issuer: 'Garba Partner', account: 'a@b.test', secret: 'ABC' })).toBe(
      'otpauth://totp/Garba%20Partner%3Aa%40b.test?secret=ABC&issuer=Garba%20Partner&algorithm=SHA1&digits=6&period=30',
    );
  });
});
