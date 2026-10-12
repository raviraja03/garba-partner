import type { RecaptchaVerifier } from 'firebase/auth';
import { getFirebaseAuth, isPhoneSignInConfigured } from '../../lib/firebase';
import { PhoneSignInError, createPhoneSignIn, type PhoneAuthSdk } from './phone-sign-in';

/**
 * Firebase Phone Authentication behind the small interface the sign-in flow uses.
 *
 * The reCAPTCHA is invisible: Google shows a challenge only when it is unsure. Its container is
 * added to `<body>` (not to a page component) so it survives the move from the phone screen to
 * the code screen, where "Resend" reuses it.
 */
const firebasePhoneSdk: PhoneAuthSdk<RecaptchaVerifier> = {
  async createVerifier(onExpired) {
    if (!isPhoneSignInConfigured) throw new PhoneSignInError('unavailable', 'not-configured');
    const [auth, { RecaptchaVerifier: Verifier }] = await Promise.all([
      getFirebaseAuth(),
      import('firebase/auth'),
    ]);
    const container = document.createElement('div');
    container.dataset.phoneSignInRecaptcha = '';
    document.body.append(container);
    const verifier = new Verifier(auth, container, {
      size: 'invisible',
      'expired-callback': onExpired,
    });
    const clear = verifier.clear.bind(verifier);
    // Clearing the verifier also takes its container (and Google's badge) off the page.
    verifier.clear = () => {
      try {
        clear();
      } finally {
        container.remove();
      }
    };
    return verifier;
  },

  async sendCode(phone, verifier) {
    const [auth, { signInWithPhoneNumber }] = await Promise.all([
      getFirebaseAuth(),
      import('firebase/auth'),
    ]);
    return signInWithPhoneNumber(auth, phone, verifier);
  },

  async signOut() {
    if (!isPhoneSignInConfigured) return;
    const [auth, { signOut }] = await Promise.all([getFirebaseAuth(), import('firebase/auth')]);
    await signOut(auth);
  },
};

/** The app's phone sign-in. One instance: the pending code lives here, in memory, between pages. */
export const phoneSignIn = createPhoneSignIn(firebasePhoneSdk);
