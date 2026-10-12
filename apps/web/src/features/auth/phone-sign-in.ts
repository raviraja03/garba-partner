/**
 * Phone sign-in, step by step, independent of Firebase's SDK (which is passed in). The pages
 * call this; the tests drive it with a fake SDK, so no SMS is ever sent by a test.
 *
 *   requestCode(phone)  → reCAPTCHA check, then Firebase sends the SMS
 *   confirmCode(code)   → Firebase checks the code and returns an ID token
 *   (the page posts that token to our API, which starts the session)
 *   reset()             → signs out of Firebase and removes the reCAPTCHA
 */

export type PhoneSignInProblem =
  | 'invalid_phone'
  | 'invalid_code'
  | 'code_expired'
  | 'rate_limited'
  | 'security_check'
  | 'network'
  | 'unavailable'
  | 'unknown';

const MESSAGES: Record<PhoneSignInProblem, string> = {
  invalid_phone: 'Enter a valid 10-digit Indian mobile number.',
  invalid_code: 'That code is not correct. Please check it and try again.',
  code_expired: 'This code has expired. Please request a new one.',
  rate_limited: 'Too many attempts. Please wait a while and try again.',
  security_check:
    'The security check did not complete. Turn off any content blocker for this site and try again.',
  network: 'Check your internet connection and try again.',
  unavailable: 'Sign-in is unavailable right now. Please try again later.',
  unknown: 'Something went wrong. Please try again.',
};

/** Firebase's error codes, grouped into what the member can do about them. */
const PROBLEM_BY_CODE: Record<string, PhoneSignInProblem> = {
  'auth/invalid-phone-number': 'invalid_phone',
  'auth/missing-phone-number': 'invalid_phone',
  'auth/invalid-verification-code': 'invalid_code',
  'auth/missing-verification-code': 'invalid_code',
  'auth/code-expired': 'code_expired',
  'auth/session-expired': 'code_expired',
  'auth/invalid-verification-id': 'code_expired',
  'auth/missing-verification-id': 'code_expired',
  'auth/too-many-requests': 'rate_limited',
  'auth/captcha-check-failed': 'security_check',
  'auth/invalid-app-credential': 'security_check',
  'auth/missing-app-credential': 'security_check',
  'auth/invalid-recaptcha-token': 'security_check',
  'auth/missing-recaptcha-token': 'security_check',
  'auth/recaptcha-not-enabled': 'security_check',
  // What the SDK reports when Google's reCAPTCHA script cannot be loaded (blocked or offline).
  'auth/internal-error': 'security_check',
  'auth/network-request-failed': 'network',
  'auth/timeout': 'network',
  'auth/quota-exceeded': 'unavailable',
  'auth/operation-not-allowed': 'unavailable',
  'auth/unauthorized-domain': 'unavailable',
  'auth/app-not-authorized': 'unavailable',
  'auth/invalid-api-key': 'unavailable',
  'auth/billing-not-enabled': 'unavailable',
  'auth/admin-restricted-operation': 'unavailable',
  'auth/unsupported-first-factor': 'unavailable',
  'auth/operation-not-supported-in-this-environment': 'unavailable',
  'auth/web-storage-unsupported': 'unavailable',
  'auth/user-disabled': 'unavailable',
};

/**
 * The only error this module throws. `message` is safe to show as is; the Firebase error
 * object (which can carry request details) never leaves this file.
 */
export class PhoneSignInError extends Error {
  constructor(
    readonly problem: PhoneSignInProblem,
    /** Firebase's short code (`unauthorized-domain`), for support. Not a message, not a secret. */
    readonly reference: string | null = null,
  ) {
    // Set-up problems are ours to fix: the reference tells support which setting is wrong.
    // A failed security check is often one too (domain, API key or reCAPTCHA configuration).
    const showReference =
      reference !== null &&
      (problem === 'unavailable' || problem === 'unknown' || problem === 'security_check');
    super(showReference ? `${MESSAGES[problem]} (Code: ${reference})` : MESSAGES[problem]);
    this.name = 'PhoneSignInError';
  }
}

export function toPhoneSignInError(error: unknown): PhoneSignInError {
  if (error instanceof PhoneSignInError) return error;
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : '';
  if (!/^auth\/[a-z0-9-]{1,60}$/.test(code)) return new PhoneSignInError('unknown');
  return new PhoneSignInError(PROBLEM_BY_CODE[code] ?? 'unknown', code.slice('auth/'.length));
}

/** The reCAPTCHA check. One exists at a time; `clear` removes it from the page. */
export interface CodeVerifier {
  clear(): void;
}

export interface SignedInUser {
  getIdToken(): Promise<string>;
}

export interface CodeConfirmation {
  confirm(code: string): Promise<{ user: SignedInUser }>;
}

/** The part of Firebase this flow needs (see `firebase-phone-sdk.ts` for the real one). */
export interface PhoneAuthSdk<V extends CodeVerifier = CodeVerifier> {
  /** Creates the invisible reCAPTCHA. `onExpired` fires when a solved check goes stale. */
  createVerifier(onExpired: () => void): Promise<V>;
  /** Runs the reCAPTCHA check and asks Firebase to send the SMS. `phone` is E.164. */
  sendCode(phone: string, verifier: V): Promise<CodeConfirmation>;
  signOut(): Promise<void>;
}

/** A code that was sent and not yet used. Kept in memory only. */
export interface PendingCode {
  /** E.164. */
  phone: string;
  /** Milliseconds since the epoch: when the latest code was sent. */
  sentAt: number;
}

export interface PhoneSignIn {
  /** Sends a code to `phone` (E.164). Calling it again for the same number is a resend. */
  requestCode(phone: string): Promise<PendingCode>;
  /** The code waiting to be entered, or null (page reloaded, or nothing requested yet). */
  pending(): PendingCode | null;
  /** Checks the code with Firebase and returns the ID token to post to our API. */
  confirmCode(code: string): Promise<string>;
  /** Forgets the pending code, signs out of Firebase and removes the reCAPTCHA. Never throws. */
  reset(): Promise<void>;
}

/** A challenge the member closes never answers: stop waiting after this long. */
const SEND_TIMEOUT_MS = 120_000;

export function createPhoneSignIn<V extends CodeVerifier>(
  sdk: PhoneAuthSdk<V>,
  options: { now?: () => number; sendTimeoutMs?: number } = {},
): PhoneSignIn {
  const now = options.now ?? Date.now;
  const sendTimeoutMs = options.sendTimeoutMs ?? SEND_TIMEOUT_MS;

  let verifier: V | null = null;
  let pending: (PendingCode & { confirmation: CodeConfirmation }) | null = null;
  /** A code Firebase already accepted: it cannot be confirmed twice, so the result is kept. */
  let confirmed: { code: string; user: SignedInUser } | null = null;
  let sending: Promise<PendingCode> | null = null;

  function discardVerifier(): void {
    const current = verifier;
    verifier = null;
    try {
      current?.clear();
    } catch {
      // Already gone (the page it lived on was removed): nothing left to clean up.
    }
  }

  async function send(phone: string): Promise<PendingCode> {
    try {
      // One verifier, reused for every resend. A new one is only made after a failure or expiry.
      verifier ??= await sdk.createVerifier(discardVerifier);
      const confirmation = await withTimeout(sdk.sendCode(phone, verifier), sendTimeoutMs);
      pending = { phone, sentAt: now(), confirmation };
      confirmed = null;
      return { phone, sentAt: pending.sentAt };
    } catch (error) {
      // A reCAPTCHA that failed or was dismissed cannot be reused: retrying starts clean.
      discardVerifier();
      throw toPhoneSignInError(error);
    }
  }

  return {
    requestCode(phone) {
      // A double tap must not send two codes (or create two reCAPTCHAs).
      sending ??= send(phone).finally(() => {
        sending = null;
      });
      return sending;
    },

    pending() {
      return pending ? { phone: pending.phone, sentAt: pending.sentAt } : null;
    },

    async confirmCode(code) {
      if (!pending) throw new PhoneSignInError('code_expired');
      try {
        let accepted = confirmed;
        if (accepted?.code !== code) {
          const { user } = await pending.confirmation.confirm(code);
          accepted = { code, user };
          confirmed = accepted;
        }
        return await accepted.user.getIdToken();
      } catch (error) {
        throw toPhoneSignInError(error);
      }
    },

    async reset() {
      pending = null;
      confirmed = null;
      discardVerifier();
      try {
        await sdk.signOut();
      } catch {
        // Nothing to sign out of (Firebase not loaded or offline). The session is ours anyway.
      }
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PhoneSignInError('security_check'));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(toPhoneSignInError(error));
      },
    );
  });
}
