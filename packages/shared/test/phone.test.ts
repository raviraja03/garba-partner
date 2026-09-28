import { describe, expect, it } from 'vitest';
import { sendOtpSchema, verifyOtpSchema } from '../src/schemas/auth.schema.js';
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
  it('normalises the phone and rejects unknown keys', () => {
    expect(sendOtpSchema.parse({ phone: '98765 43210' })).toEqual({ phone: '+919876543210' });
    expect(sendOtpSchema.safeParse({ phone: '9876543210', extra: true }).success).toBe(false);
  });

  it('requires a 6-digit code', () => {
    expect(verifyOtpSchema.safeParse({ phone: '9876543210', code: '123456' }).success).toBe(true);
    expect(verifyOtpSchema.safeParse({ phone: '9876543210', code: '12345' }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ phone: '9876543210', code: '12345a' }).success).toBe(false);
  });
});
