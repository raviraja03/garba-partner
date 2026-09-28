// zod/mini keeps browser bundles small; the API uses the same schemas for validation.
import * as z from 'zod/mini';
import { LIMITS } from '../constants/limits.js';
import { normalizeIndianMobile } from '../utils/phone.js';

/** Any common way of writing an Indian mobile number; normalised to E.164 on parse. */
const indianMobile = z.pipe(
  z.string().check(z.maxLength(20, 'Enter a valid mobile number.')),
  z.transform((value, ctx) => {
    const normalized = normalizeIndianMobile(value);
    if (!normalized) {
      ctx.issues.push({
        code: 'custom',
        message: 'Enter a valid 10-digit Indian mobile number.',
        input: value,
      });
      return z.NEVER;
    }
    return normalized;
  }),
);

const otpCode = z
  .string()
  .check(
    z.regex(
      new RegExp(`^\\d{${String(LIMITS.OTP_LENGTH)}}$`),
      `Enter the ${String(LIMITS.OTP_LENGTH)}-digit code.`,
    ),
  );

export const sendOtpSchema = z.strictObject({ phone: indianMobile });
export type SendOtpInput = z.input<typeof sendOtpSchema>;

export const verifyOtpSchema = z.strictObject({ phone: indianMobile, code: otpCode });
export type VerifyOtpInput = z.input<typeof verifyOtpSchema>;

export const logoutSchema = z.strictObject({
  /** Also revoke every other session of the account ("log out of all devices"). */
  allDevices: z.optional(z.boolean()),
});
export type LogoutInput = z.input<typeof logoutSchema>;

export const adminLoginSchema = z.strictObject({
  email: z.pipe(
    z.string().check(z.trim(), z.toLowerCase(), z.maxLength(254)),
    z.email('Enter a valid email address.'),
  ),
  password: z.string().check(z.minLength(1, 'Enter your password.'), z.maxLength(256)),
});
export type AdminLoginInput = z.input<typeof adminLoginSchema>;
