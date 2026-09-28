/**
 * Detects contact details in free text (bio, and later chat messages): phone numbers (8+ digits,
 * possibly separated), email addresses and web links. Profiles must not be used to share contact
 * details before members have matched (docs/users/privacy-rules.md).
 */
const PHONE_LIKE = /(?:\+?\d[\s\-().]*){8,}/;
const EMAIL_LIKE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|in|net|org|me|io|co|app|link|ly)\b/i;

export function looksLikeContactInfo(text: string): boolean {
  return PHONE_LIKE.test(text) || EMAIL_LIKE.test(text) || URL_LIKE.test(text);
}

/** NFKC-normalises, trims and collapses internal whitespace. */
export function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

/** Control, zero-width, bidi-override and BOM code points (could hide or disguise content). */
const INVISIBLE_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x7f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
];

/** Removes invisible characters that could hide content. */
export function stripInvisible(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return !INVISIBLE_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
    })
    .join('');
}
