/** Helpers that keep personal data and secrets out of logs and log tables. */

const DIGIT_RUN = /(?<![\w-])\+?\d{4,15}(?![\w-])/g;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

/**
 * `+919876543210` → `+91XXXXXX3210`. Shows the country code and the last four digits, which is
 * enough to recognise a number in a log without revealing it.
 */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 8) return 'X'.repeat(digits.length);
  const countryCode = digits.slice(0, digits.length - 10);
  const prefix = countryCode ? `+${countryCode}` : '';
  return `${prefix}${'X'.repeat(6)}${digits.slice(-4)}`;
}

/**
 * Makes free text (an error message from a library or a provider) safe to log or store:
 * one line, standalone digit runs (phone numbers, codes) and email addresses masked, and cut to
 * `maxLength`. IDs such as UUIDs are left alone.
 */
export function sanitizeLogText(text: string, maxLength = 300): string {
  const clean = text
    .replace(/\s+/g, ' ')
    .replace(EMAIL, '[email]')
    .replace(DIGIT_RUN, '[digits]')
    .trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}
