import type { Auth } from 'firebase/auth';
import { env } from './env';

/** False when the `VITE_FIREBASE_*` variables are missing: sign-in then says it is unavailable. */
export const isPhoneSignInConfigured = env.firebase !== null;

let authPromise: Promise<Auth> | null = null;

/**
 * The one Firebase Auth instance of this app, created on first use.
 *
 * - Loaded on demand, so pages that never sign in (the landing page) do not download Firebase.
 * - Only Auth is initialised. Analytics is deliberately not: sign-in must not depend on it.
 * - `inMemoryPersistence`: Firebase is used only to prove the phone number. Its tokens are
 *   never written to localStorage or IndexedDB; our own session takes over after the exchange.
 */
export function getFirebaseAuth(): Promise<Auth> {
  authPromise ??= (async () => {
    const config = env.firebase;
    if (!config) throw new Error('Firebase is not configured');
    const [{ getApp, getApps, initializeApp }, { getAuth, initializeAuth, inMemoryPersistence }] =
      await Promise.all([import('firebase/app'), import('firebase/auth')]);
    // Hot reload can run this module again while the app already exists.
    if (getApps().length > 0) return getAuth(getApp());
    return initializeAuth(initializeApp(config), { persistence: inMemoryPersistence });
  })();
  // A failed load (offline) must not be remembered: the next attempt tries again.
  authPromise.catch(() => {
    authPromise = null;
  });
  return authPromise;
}
