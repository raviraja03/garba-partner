import { describe, expect, it } from 'vitest';
import { phoneLoginSchema } from '../src/schemas/auth.schema.js';
import { maskPhone, normalizeIndianMobile } from '../src/utils/phone.js';

describe('normalizeIndianMobile', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['(+91) 98765-43210', '+919876543210'],
    ['6000000000', '+916000000000'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected);
  });

  it.each(['5876543210', '987654321', '98765432101', '+1 202 555 0100', 'abcdefghij', ''])(
    'rejects %s',
    (input) => {
      expect(normalizeIndianMobile(input)).toBeNull();
    },
  );
});

describe('maskPhone', () => {
  it('keeps only the country code and last three digits', () => {
    expect(maskPhone('+919876543210')).toBe('+91 ••••• ••210');
  });
});

describe('auth schemas', () => {
  it('accepts only a Firebase ID token, and rejects anything else in the body', () => {
    const idToken = 'a'.repeat(900);
    expect(phoneLoginSchema.parse({ idToken })).toEqual({ idToken });
    expect(phoneLoginSchema.safeParse({}).success).toBe(false);
    expect(phoneLoginSchema.safeParse({ idToken: 'short' }).success).toBe(false);
    expect(phoneLoginSchema.safeParse({ idToken: 'a'.repeat(5000) }).success).toBe(false);
    // A browser cannot supply its own identity or role alongside the token.
    for (const extra of [
      { phone: '+919876543210' },
      { uid: 'x' },
      { role: 'admin' },
      { isAdmin: true },
    ]) {
      expect(phoneLoginSchema.safeParse({ idToken, ...extra }).success).toBe(false);
    }
  });
});
