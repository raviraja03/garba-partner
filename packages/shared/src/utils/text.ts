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

/** UPI payment IDs such as `name@okaxis` (no dot after the @, unlike emails). */
const UPI_LIKE = /\b[\w.-]{2,}@[a-z]{2,}\b/i;

/**
 * Contact or payment details in a chat message: phone, email, link or UPI ID. Chat does NOT
 * block these (adults may choose to share); the sender sees a nudge and the server records the
 * flag as moderation context (docs/chat/safety.md#contact-sharing-nudge).
 */
export function looksLikeContactDetails(text: string): boolean {
  return looksLikeContactInfo(text) || UPI_LIKE.test(text);
}

/**
 * Phone numbers or email addresses (links allowed). Guards public event and organizer text so
 * private organizer contact details are not published by accident (docs/events/organizer-management.md).
 */
export function containsPhoneOrEmail(text: string): boolean {
  return PHONE_LIKE.test(text) || EMAIL_LIKE.test(text);
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
