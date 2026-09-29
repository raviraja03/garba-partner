import { randomInt } from 'node:crypto';

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const BASE_MAX_LENGTH = 100;

/**
 * Public URL slug: the name in ASCII (accents removed) plus a random 6-character suffix, e.g.
 * `navratri-night-at-gmdc-k3v9qa`. The suffix keeps slugs unique and unguessable for drafts.
 * Names in other scripts (e.g. Gujarati) fall back to `event-…`.
 */
export function createEventSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BASE_MAX_LENGTH)
    .replace(/-+$/g, '');
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)];
  return `${base || 'event'}-${suffix}`;
}
