// zod/mini keeps browser bundles small; the API uses the same schemas for validation.
import * as z from 'zod/mini';

/**
 * `POST /api/v1/auth/phone`: the Firebase ID token the browser received after the member
 * verified their number by SMS. Nothing else is accepted: the phone number, the user ID and any
 * role come from the verified token and the database, never from the request body.
 */
export const phoneLoginSchema = z.strictObject({
  idToken: z
    .string()
    .check(z.minLength(100, 'Invalid token.'), z.maxLength(4096, 'Invalid token.')),
});
export type PhoneLoginInput = z.input<typeof phoneLoginSchema>;

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
