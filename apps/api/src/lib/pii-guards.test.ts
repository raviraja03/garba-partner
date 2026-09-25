import { describe, expect, it } from 'vitest';
import { containsAadhaarLikeNumber, isVerhoeffValid } from './pii-guards.js';

// Synthetic numbers that pass the Verhoeff checksum. They are NOT real Aadhaar numbers.
const VALID_SHAPED = '234123412346';
const VALID_SHAPED_2 = '987654321096';
const CHECKSUM_FAILS = '234123412347';

describe('isVerhoeffValid', () => {
  it('accepts valid checksums and rejects invalid ones', () => {
    expect(isVerhoeffValid('2363')).toBe(true);
    expect(isVerhoeffValid(VALID_SHAPED)).toBe(true);
    expect(isVerhoeffValid(CHECKSUM_FAILS)).toBe(false);
    expect(isVerhoeffValid('12a4')).toBe(false);
  });
});

describe('containsAadhaarLikeNumber', () => {
  it.each([
    VALID_SHAPED,
    '2341 2341 2346',
    '2341-2341-2346',
    `ref:${VALID_SHAPED}`,
    `abc ${VALID_SHAPED_2} def`,
  ])('flags %s', (value) => {
    expect(containsAadhaarLikeNumber(value)).toBe(true);
  });

  it.each([
    CHECKSUM_FAILS, // fails the checksum
    '134123412346', // starts with 1
    `x${VALID_SHAPED}`, // not standalone
    `${VALID_SHAPED}0`, // 13 digits
    'a1f0c3de-0001-4000-8000-000000000001', // UUID
    'dev/verification/a1f0c3de-0002-4000-8000-000000000002/selfie',
    '12345678901',
  ])('allows %s', (value) => {
    expect(containsAadhaarLikeNumber(value)).toBe(false);
  });
});
