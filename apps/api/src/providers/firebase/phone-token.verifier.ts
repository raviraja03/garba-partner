import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { normalizeIndianMobile } from '@garba-partner/shared';

/**
 * Proves that a browser really verified a phone number with Firebase Phone Authentication
 * (docs/auth/firebase-phone-auth.md).
 *
 * The web app signs in with Firebase (reCAPTCHA + an SMS code) and sends us the resulting ID
 * token. Nothing else the browser says is trusted: the phone number comes out of this token,
 * and only after its signature, project, issuer and age have been checked.
 *
 * Verification follows Firebase's documented rules for third-party JWT libraries: RS256, signed
 * by one of Google's rotating keys, `aud` = the project ID, `iss` =
 * `https://securetoken.google.com/<project ID>`. That needs the project ID only, so there is no
 * service-account key to store or leak, and no Admin SDK.
 */

const GOOGLE_KEYS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/** Why a token was refused. For logs and tests; the member only ever sees a generic message. */
export type PhoneTokenRejection =
  | 'malformed'
  | 'bad_signature'
  | 'expired'
  | 'wrong_project'
  | 'not_phone_sign_in'
  | 'no_phone_number'
  | 'unsupported_number'
  | 'too_old'
  | 'keys_unavailable';

export class PhoneTokenError extends Error {
  readonly reason: PhoneTokenRejection;

  constructor(reason: PhoneTokenRejection) {
    super(`Firebase ID token rejected: ${reason}`);
    this.name = 'PhoneTokenError';
    this.reason = reason;
  }
}

export interface VerifiedPhone {
  /** The verified number, normalised (`+919876543210`). */
  phone: string;
  /** The Firebase user ID. Informational: GarbaMates accounts are keyed by phone number. */
  firebaseUid: string;
  /** When the member completed the SMS verification. */
  verifiedAt: Date;
}

export interface PhoneTokenVerifier {
  /** Resolves with the verified phone number, or rejects with {@link PhoneTokenError}. */
  verify(idToken: string): Promise<VerifiedPhone>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function createFirebasePhoneTokenVerifier(options: {
  projectId: string;
  /**
   * How long after the SMS verification the token may still be exchanged for a session.
   * Firebase ID tokens live for an hour; ours are used within seconds, so a short window makes a
   * stolen or replayed token useless.
   */
  maxAgeSeconds: number;
  /** Google's signing keys. Replaced in tests; fetched (and cached) from Google otherwise. */
  keys?: JWTVerifyGetKey;
  now?: () => Date;
}): PhoneTokenVerifier {
  const keys = options.keys ?? createRemoteJWKSet(new URL(GOOGLE_KEYS_URL));
  const now = options.now ?? (() => new Date());
  const issuer = `https://securetoken.google.com/${options.projectId}`;

  return {
    async verify(idToken) {
      let payload: Record<string, unknown>;
      try {
        const result = await jwtVerify(idToken, keys, {
          algorithms: ['RS256'],
          issuer,
          audience: options.projectId,
          currentDate: now(),
          // A few seconds of clock difference between Google and this server is normal.
          clockTolerance: 5,
        });
        payload = result.payload;
      } catch (err) {
        if (err instanceof errors.JWTExpired) throw new PhoneTokenError('expired');
        if (err instanceof errors.JWTClaimValidationFailed) {
          throw new PhoneTokenError(
            err.claim === 'iss' || err.claim === 'aud' ? 'wrong_project' : 'malformed',
          );
        }
        if (
          err instanceof errors.JWSSignatureVerificationFailed ||
          err instanceof errors.JWKSNoMatchingKey ||
          err instanceof errors.JOSEAlgNotAllowed
        ) {
          throw new PhoneTokenError('bad_signature');
        }
        if (err instanceof errors.JWKSTimeout || !(err instanceof errors.JOSEError)) {
          // Google's key endpoint could not be reached: nothing can be verified right now.
          throw new PhoneTokenError('keys_unavailable');
        }
        throw new PhoneTokenError('malformed');
      }

      const firebaseUid = typeof payload.sub === 'string' ? payload.sub : '';
      if (!firebaseUid) throw new PhoneTokenError('malformed');

      // The number only counts if THIS sign-in was the phone verification itself.
      const firebase = isRecord(payload.firebase) ? payload.firebase : {};
      if (firebase.sign_in_provider !== 'phone') throw new PhoneTokenError('not_phone_sign_in');

      if (typeof payload.phone_number !== 'string' || payload.phone_number.length === 0) {
        throw new PhoneTokenError('no_phone_number');
      }
      const phone = normalizeIndianMobile(payload.phone_number);
      if (!phone) throw new PhoneTokenError('unsupported_number');

      const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : 0;
      const ageSeconds = now().getTime() / 1000 - authTime;
      if (authTime <= 0 || ageSeconds > options.maxAgeSeconds) throw new PhoneTokenError('too_old');

      return { phone, firebaseUid, verifiedAt: new Date(authTime * 1000) };
    },
  };
}
