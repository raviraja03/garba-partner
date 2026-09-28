/**
 * Normalises an Indian mobile number to E.164 (`+91XXXXXXXXXX`), or returns null.
 * Accepts `+91 98765 43210`, `919876543210`, `09876543210`, `9876543210` (spaces, hyphens,
 * dots and parentheses are ignored). Indian mobile numbers start with 6, 7, 8 or 9.
 * The MVP supports Indian numbers only (docs/auth/otp-flow.md).
 */
export function normalizeIndianMobile(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, '');
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(compact);
  return match?.[1] ? `+91${match[1]}` : null;
}

/** `+919876543210` → `+91 ••••• ••210` (for UI confirmation screens; never for logs). */
export function maskPhone(e164: string): string {
  return `${e164.slice(0, 3)} ••••• ••${e164.slice(-3)}`;
}
