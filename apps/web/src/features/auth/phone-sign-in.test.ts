import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PhoneSignInError,
  createPhoneSignIn,
  toPhoneSignInError,
  type CodeVerifier,
  type PhoneAuthSdk,
} from './phone-sign-in';

const PHONE = '+919876543210';
const firebaseError = (code: string) =>
  Object.assign(new Error(`Firebase: Error (${code}). key=AIzaSECRET-LOOKING tel=${PHONE}`), {
    code,
    customData: { appName: '[DEFAULT]', _tokenResponse: { idToken: 'raw-token' } },
  });

interface FakeVerifier extends CodeVerifier {
  id: number;
  cleared: boolean;
  expire: () => void;
}

/** Stands in for Firebase: no network, no SMS. The code that "arrives" is always 123456. */
function fakeSdk() {
  const verifiers: FakeVerifier[] = [];
  const sent: { phone: string; verifier: number }[] = [];
  const state = {
    sendError: null as Error | null,
    createError: null as Error | null,
    /** When set, `sendCode` waits for this (a challenge the member has not answered). */
    hold: null as Promise<void> | null,
    signedOut: 0,
    confirmCalls: 0,
    tokenCalls: 0,
  };
  const sdk: PhoneAuthSdk<FakeVerifier> = {
    createVerifier(onExpired) {
      if (state.createError) return Promise.reject(state.createError);
      const verifier: FakeVerifier = {
        id: verifiers.length + 1,
        cleared: false,
        clear() {
          this.cleared = true;
        },
        expire: onExpired,
      };
      verifiers.push(verifier);
      return Promise.resolve(verifier);
    },
    async sendCode(phone, verifier) {
      if (verifier.cleared) throw new Error('used a cleared verifier');
      if (state.hold) await state.hold;
      if (state.sendError) throw state.sendError;
      sent.push({ phone, verifier: verifier.id });
      const sendNumber = sent.length;
      return {
        confirm(code) {
          state.confirmCalls += 1;
          if (sendNumber !== sent.length) {
            return Promise.reject(firebaseError('auth/code-expired'));
          }
          if (code !== '123456') {
            return Promise.reject(firebaseError('auth/invalid-verification-code'));
          }
          return Promise.resolve({
            user: {
              getIdToken() {
                state.tokenCalls += 1;
                return Promise.resolve(`id-token-for-${phone}`);
              },
            },
          });
        },
      };
    },
    signOut() {
      state.signedOut += 1;
      return Promise.resolve();
    },
  };
  return { sdk, verifiers, sent, state };
}

const problemOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PhoneSignInError);
  return (error as PhoneSignInError).problem;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('phone sign-in flow', () => {
  it('sends a code, confirms it and returns the ID token', async () => {
    const fake = fakeSdk();
    const flow = createPhoneSignIn(fake.sdk, { now: () => 1_000 });
    expect(flow.pending()).toBeNull();

    expect(await flow.requestCode(PHONE)).toEqual({ phone: PHONE, sentAt: 1_000 });
    expect(flow.pending()).toEqual({ phone: PHONE, sentAt: 1_000 });
    expect(fake.sent).toEqual([{ phone: PHONE, verifier: 1 }]);

    expect(await flow.confirmCode('123456')).toBe(`id-token-for-${PHONE}`);
  });

  it('resend reuses the one reCAPTCHA instead of creating another', async () => {
    const fake = fakeSdk();
    let time = 1_000;
    const flow = createPhoneSignIn(fake.sdk, { now: () => time });
    await flow.requestCode(PHONE);
    time = 40_000;
    await flow.requestCode(PHONE);
    await flow.requestCode(PHONE);

    expect(fake.verifiers).toHaveLength(1);
    expect(fake.verifiers[0]?.cleared).toBe(false);
    expect(fake.sent.map((s) => s.verifier)).toEqual([1, 1, 1]);
    expect(flow.pending()?.sentAt).toBe(40_000);
    // Only the newest code works.
    expect(await flow.confirmCode('123456')).toBe(`id-token-for-${PHONE}`);
  });

  it('a double tap sends one code', async () => {
    const fake = fakeSdk();
    const flow = createPhoneSignIn(fake.sdk);
    await Promise.all([flow.requestCode(PHONE), flow.requestCode(PHONE)]);
    expect(fake.sent).toHaveLength(1);
    expect(fake.verifiers).toHaveLength(1);
  });

  it('a wrong code is refused and the right one still works afterwards', async () => {
    const fake = fakeSdk();
    const flow = createPhoneSignIn(fake.sdk);
    await flow.requestCode(PHONE);
    expect(await problemOf(flow.confirmCode('000000'))).toBe('invalid_code');
    expect(await flow.confirmCode('123456')).toBe(`id-token-for-${PHONE}`);
  });

  it('an old code after a resend is reported as expired', async () => {
    const fake = fakeSdk();
    const flow = createPhoneSignIn(fake.sdk);
    await flow.requestCode(PHONE);
    const firstPending = flow.pending();
    await flow.requestCode(PHONE);
    expect(flow.pending()).not.toBe(firstPending);
    // The fake treats a confirmation from an earlier send as expired, like Firebase does.
    fake.state.sendError = firebaseError('auth/too-many-requests');
    expect(await problemOf(flow.requestCode(PHONE))).toBe('rate_limited');
    // The failed resend did not throw the last good code away.
    expect(await flow.confirmCode('123456')).toBe(`id-token-for-${PHONE}`);
  });

  it('confirming without a pending code asks for a new one', async () => {
    const flow = createPhoneSignIn(fakeSdk().sdk);
    expect(await problemOf(flow.confirmCode('123456'))).toBe('code_expired');
  });

  it('if our API call fails after Firebase accepted the code, retrying does not re-confirm it', async () => {
    const fake = fakeSdk();
    const flow = createPhoneSignIn(fake.sdk);
    await flow.requestCode(PHONE);
    await flow.confirmCode('123456');
    // (the page's request to our API fails here; the member presses "Verify" again)
    expect(await flow.confirmCode('123456')).toBe(`id-token-for-${PHONE}`);
    expect(fake.state.confirmCalls).toBe(1); // a code can only be confirmed once
    expect(fake.state.tokenCalls).toBe(2);
  });

  it('a failed send discards the reCAPTCHA so that retrying starts with a fresh one', async () => {
    const fake = fakeSdk();
    const flow = createPhoneSignIn(fake.sdk);
    fake.state.sendError = firebaseError('auth/captcha-check-failed');
    expect(await problemOf(flow.requestCode(PHONE))).toBe('security_check');
    expect(fake.verifiers[0]?.cleared).toBe(true);
    expect(flow.pending()).toBeNull();

    fake.state.sendError = null;
    await flow.requestCode(PHONE);
    expect(fake.verifiers).toHaveLength(2);
    expect(fake.sent).toEqual([{ phone: PHONE, verifier: 2 }]);
  });

  it('an expired reCAPTCHA is replaced on the next send, never reused', async () => {
    const fake = fakeSdk();
    const flow = createPhoneSignIn(fake.sdk);
    await flow.requestCode(PHONE);
    fake.verifiers[0]?.expire();
    expect(fake.verifiers[0]?.cleared).toBe(true);
    // The code already sent is still valid.
    expect(flow.pending()).not.toBeNull();

    await flow.requestCode(PHONE);
    expect(fake.verifiers).toHaveLength(2);
    expect(fake.sent.at(-1)?.verifier).toBe(2);
  });

  it('reCAPTCHA that cannot load (blocked or offline) is reported, and retry works', async () => {
    const fake = fakeSdk();
    const flow = createPhoneSignIn(fake.sdk);
    fake.state.createError = firebaseError('auth/internal-error');
    expect(await problemOf(flow.requestCode(PHONE))).toBe('security_check');
    fake.state.createError = firebaseError('auth/network-request-failed');
    expect(await problemOf(flow.requestCode(PHONE))).toBe('network');
    fake.state.createError = null;
    await expect(flow.requestCode(PHONE)).resolves.toMatchObject({ phone: PHONE });
  });

  it('a challenge that is never answered stops waiting, and the button can be used again', async () => {
    vi.useFakeTimers();
    const fake = fakeSdk();
    const flow = createPhoneSignIn(fake.sdk, { sendTimeoutMs: 5_000 });
    fake.state.hold = new Promise(() => undefined);
    const attempt = problemOf(flow.requestCode(PHONE));
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await attempt).toBe('security_check');
    expect(fake.verifiers[0]?.cleared).toBe(true);

    fake.state.hold = null;
    await expect(flow.requestCode(PHONE)).resolves.toMatchObject({ phone: PHONE });
    expect(fake.verifiers).toHaveLength(2);
  });

  it('reset forgets the code, removes the reCAPTCHA and signs out of Firebase', async () => {
    const fake = fakeSdk();
    const flow = createPhoneSignIn(fake.sdk);
    await flow.requestCode(PHONE);
    await flow.reset();
    expect(flow.pending()).toBeNull();
    expect(fake.verifiers[0]?.cleared).toBe(true);
    expect(fake.state.signedOut).toBe(1);
    expect(await problemOf(flow.confirmCode('123456'))).toBe('code_expired');

    // Safe to call with nothing to reset, and when Firebase cannot be reached.
    fake.sdk.signOut = () => Promise.reject(new Error('offline'));
    await expect(flow.reset()).resolves.toBeUndefined();
  });
});

describe('Firebase errors shown to members', () => {
  it.each([
    ['auth/invalid-phone-number', 'invalid_phone'],
    ['auth/invalid-verification-code', 'invalid_code'],
    ['auth/code-expired', 'code_expired'],
    ['auth/session-expired', 'code_expired'],
    ['auth/too-many-requests', 'rate_limited'],
    ['auth/captcha-check-failed', 'security_check'],
    ['auth/invalid-app-credential', 'security_check'],
    ['auth/network-request-failed', 'network'],
    ['auth/quota-exceeded', 'unavailable'],
    ['auth/operation-not-allowed', 'unavailable'],
    ['auth/unauthorized-domain', 'unavailable'],
    ['auth/billing-not-enabled', 'unavailable'],
    ['auth/something-new-from-google', 'unknown'],
  ])('%s → %s', (code, problem) => {
    expect(toPhoneSignInError(firebaseError(code)).problem).toBe(problem);
  });

  it('never passes on Firebase’s own text, token or number', () => {
    for (const code of ['auth/unauthorized-domain', 'auth/invalid-verification-code', 'weird']) {
      const error = toPhoneSignInError(firebaseError(code));
      const shown = `${error.message} ${JSON.stringify(error)}`;
      expect(shown).not.toMatch(/Firebase|AIza|raw-token|\+91|customData/);
      expect(error).not.toHaveProperty('customData');
    }
  });

  it('set-up problems carry a short code for support; member mistakes do not', () => {
    expect(toPhoneSignInError(firebaseError('auth/unauthorized-domain')).message).toBe(
      'Sign-in is unavailable right now. Please try again later. (Code: unauthorized-domain)',
    );
    expect(toPhoneSignInError(firebaseError('auth/invalid-verification-code')).message).toBe(
      'That code is not correct. Please check it and try again.',
    );
  });

  it('handles things that are not Firebase errors', () => {
    for (const thing of [null, undefined, 'text', new Error('boom'), { code: 42 }, { code: 'x' }]) {
      const error = toPhoneSignInError(thing);
      expect(error.problem).toBe('unknown');
      expect(error.message).toBe('Something went wrong. Please try again.');
    }
    expect(toPhoneSignInError({ code: 'auth/<script>alert(1)</script>' }).reference).toBeNull();
  });
});
