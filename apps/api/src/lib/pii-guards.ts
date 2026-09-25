/**
 * Guards that keep identity-document numbers out of storage. The platform must never store
 * Aadhaar numbers (docs/architecture/security-architecture.md §4.2).
 *
 * An Aadhaar number is 12 digits, never starts with 0 or 1, and ends with a Verhoeff check
 * digit. Requiring all three (plus standalone boundaries) keeps false positives on ordinary
 * identifiers such as UUIDs negligible. Mirrored by the SQL function
 * `contains_aadhaar_like_number()` used in CHECK constraints on `user_verifications`.
 */

// Verhoeff multiplication (D) and permutation (P) tables.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;

function lookup(table: readonly (readonly number[])[], row: number, column: number): number {
  const value = table[row]?.[column];
  if (value === undefined) throw new Error('Verhoeff table index out of range');
  return value;
}

/** True when a string of digits passes the Verhoeff checksum. */
export function isVerhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let checksum = 0;
  const reversed = [...digits].reverse();
  reversed.forEach((char, index) => {
    checksum = lookup(D, checksum, lookup(P, index % 8, Number(char)));
  });
  return checksum === 0;
}

/**
 * A standalone run of 12 digits (optionally grouped 4-4-4 with spaces or hyphens), first digit
 * 2–9, not directly adjacent to other letters or digits.
 */
const AADHAAR_SHAPED = /(?<![0-9A-Za-z])([2-9]\d{3})[ -]?(\d{4})[ -]?(\d{4})(?![0-9A-Za-z])/g;

/** True when `value` contains something that looks like a valid Aadhaar number. */
export function containsAadhaarLikeNumber(value: string): boolean {
  for (const match of value.matchAll(AADHAAR_SHAPED)) {
    if (isVerhoeffValid(`${match[1] ?? ''}${match[2] ?? ''}${match[3] ?? ''}`)) return true;
  }
  return false;
}
