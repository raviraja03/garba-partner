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
 * Requests for money, payments or financial secrets, in English and common Hinglish/Gujarati
 * phrasing. Mentions of prices ("the pass is ₹500") are NOT matched: only asking someone to pay,
 * send, lend or share payment details.
 */
const MONEY_REQUEST_PATTERNS: readonly RegExp[] = [
  // "send me 500", "transfer us ₹2000", "pay me"
  /\b(?:send|transfer|lend|give)\s+(?:me|us)\s+(?:₹\s?|rs\.?\s?)?\d/i,
  /\bpay\s+(?:me|us)\b/i,
  // "can you send money", "lend some cash", "transfer 2000 rupees"
  /\b(?:send|transfer|lend|borrow)\b[^.?!\n]{0,40}(?:\b(?:money|cash|rupees?|rs|inr|funds?|loan)\b|₹)/i,
  // "I need money urgently"
  /\bneed\b[^.?!\n]{0,30}\b(?:money|cash|loan|funds)\b/i,
  // Payment apps and UPI requests
  /\b(?:g\s?pay|google\s?pay|phone\s?pe|paytm|upi|bhim)\b/i,
  // Financial secrets and classic scam hooks
  /\b(?:otp|cvv|ifsc|atm\s?pin|card\s?number|account\s?number|bank\s?details)\b/i,
  /\b(?:gift\s?cards?|crypto|bitcoin|investment\s?(?:plan|scheme|opportunity))\b/i,
  // Hinglish / Gujarati: "paise bhejo", "paisa chahiye", "udhaar", "rupiya moklo"
  /\b(?:paise|paisa|paisay|rupiya|rupaye|rupiye)\b[^.?!\n]{0,20}\b(?:bhej|chahiye|de\s?do|dedo|do|moklo|mokal|aapo|apo)/i,
  /\b(?:udhaar|udhar|udhari)\b/i,
];

/**
 * A chat message that looks like a request for money or payment details (a common scam). Chat
 * does not block it: the recipient sees a scam warning and repeated requests are flagged to
 * moderators (docs/safety/abuse-prevention.md#5-scam-and-money-warnings).
 */
export function looksLikeMoneyRequest(text: string): boolean {
  return (
    MONEY_REQUEST_PATTERNS.some((pattern) => pattern.test(text)) ||
    // A bare UPI ID ("name@okaxis") is a payment request in a dating/partner chat.
    (UPI_LIKE.test(text) && !EMAIL_LIKE.test(text))
  );
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
