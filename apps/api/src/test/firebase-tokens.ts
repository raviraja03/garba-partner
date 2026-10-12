import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import { LIMITS } from '@garba-partner/shared';
import {
  createFirebasePhoneTokenVerifier,
  type PhoneTokenVerifier,
} from '../providers/firebase/index.js';

export const TEST_FIREBASE_PROJECT = 'garbamates-test';

export interface IdTokenOptions {
  /** E.164, e.g. `+919876543210`. `null` leaves the claim out. */
  phone?: string | null;
  projectId?: string;
  /** `firebase.sign_in_provider`. Real phone sign-ins have `phone`. */
  provider?: string;
  /** Seconds ago that the SMS code was verified. */
  verifiedSecondsAgo?: number;
  /** Seconds until the token expires (negative = already expired). */
  expiresInSeconds?: number;
  uid?: string | null;
}

/**
 * Stands in for Google's token service in tests: it has its own signing key, publishes the
 * public half the way Google does, and issues ID tokens with the same claims Firebase Phone
 * Authentication produces. The REAL verifier is then pointed at these keys, so signature,
 * project, expiry and age checks are all exercised without calling Google.
 */
export async function createFirebaseTestIssuer() {
  const kid = 'test-key-1';
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const keys: JWTVerifyGetKey = createLocalJWKSet({
    keys: [{ ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' }],
  });
  // A second key pair that the verifier does NOT know: a forger's key.
  const forger = await generateKeyPair('RS256');

  async function idToken(options: IdTokenOptions = {}, signWith = privateKey): Promise<string> {
    const projectId = options.projectId ?? TEST_FIREBASE_PROJECT;
    const now = Math.floor(Date.now() / 1000);
    const authTime = now - (options.verifiedSecondsAgo ?? 2);
    const phone = options.phone === undefined ? '+919876543210' : options.phone;
    const jwt = new SignJWT({
      auth_time: authTime,
      user_id: options.uid ?? 'firebase-uid-1',
      ...(phone === null ? {} : { phone_number: phone }),
      firebase: {
        identities: phone === null ? {} : { phone: [phone] },
        sign_in_provider: options.provider ?? 'phone',
      },
    })
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .setIssuer(`https://securetoken.google.com/${projectId}`)
      .setAudience(projectId)
      .setIssuedAt(authTime)
      .setExpirationTime(now + (options.expiresInSeconds ?? 3600));
    if (options.uid !== null) jwt.setSubject(options.uid ?? 'firebase-uid-1');
    return jwt.sign(signWith);
  }

  const verifier = (
    overrides: { keys?: JWTVerifyGetKey; maxAgeSeconds?: number } = {},
  ): PhoneTokenVerifier =>
    createFirebasePhoneTokenVerifier({
      projectId: TEST_FIREBASE_PROJECT,
      maxAgeSeconds: overrides.maxAgeSeconds ?? LIMITS.PHONE_TOKEN_MAX_AGE_SECONDS,
      keys: overrides.keys ?? keys,
    });

  return {
    keys,
    idToken,
    /** A token with valid claims, signed by a key Google never published. */
    forgedIdToken: (options: IdTokenOptions = {}) => idToken(options, forger.privateKey),
    /** The real verifier, trusting this issuer's keys. */
    verifier,
  };
}
