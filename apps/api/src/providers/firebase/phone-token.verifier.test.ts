import { SignJWT, UnsecuredJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createFirebaseTestIssuer, TEST_FIREBASE_PROJECT } from '../../test/firebase-tokens.js';
import { PhoneTokenError, type PhoneTokenRejection } from './index.js';

describe('Firebase phone ID token verification', () => {
  let firebase: Awaited<ReturnType<typeof createFirebaseTestIssuer>>;
  beforeAll(async () => {
    firebase = await createFirebaseTestIssuer();
  });

  const reasonFor = async (token: string, verifier = firebase.verifier()) => {
    const error = await verifier.verify(token).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PhoneTokenError);
    return (error as PhoneTokenError).reason;
  };

  it('accepts a genuine token and returns the verified number', async () => {
    const result = await firebase
      .verifier()
      .verify(await firebase.idToken({ phone: '+919876543210', uid: 'abc123' }));
    expect(result.phone).toBe('+919876543210');
    expect(result.firebaseUid).toBe('abc123');
    expect(Date.now() - result.verifiedAt.getTime()).toBeLessThan(10_000);
  });

  it('rejects a token signed by a key Google did not publish', async () => {
    expect(await reasonFor(await firebase.forgedIdToken())).toBe<PhoneTokenRejection>(
      'bad_signature',
    );
  });

  it('rejects a tampered token (number changed after signing)', async () => {
    const [header, payload, signature] = (await firebase.idToken()).split('.') as [
      string,
      string,
      string,
    ];
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    const tampered = Buffer.from(
      JSON.stringify({ ...claims, phone_number: '+919000000001' }),
    ).toString('base64url');
    expect(await reasonFor(`${header}.${tampered}.${signature}`)).toBe('bad_signature');
  });

  it('rejects unsigned tokens and tokens signed with another algorithm', async () => {
    const claims = {
      phone_number: '+919876543210',
      auth_time: Math.floor(Date.now() / 1000),
      firebase: { sign_in_provider: 'phone' },
    };
    const unsigned = new UnsecuredJWT(claims)
      .setIssuer(`https://securetoken.google.com/${TEST_FIREBASE_PROJECT}`)
      .setAudience(TEST_FIREBASE_PROJECT)
      .setSubject('x')
      .setExpirationTime('1h')
      .encode();
    expect(['bad_signature', 'malformed']).toContain(await reasonFor(unsigned));

    // The classic downgrade: an HMAC token keyed with something public.
    const hmac = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256', kid: 'test-key-1' })
      .setIssuer(`https://securetoken.google.com/${TEST_FIREBASE_PROJECT}`)
      .setAudience(TEST_FIREBASE_PROJECT)
      .setSubject('x')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('public-key-material-used-as-a-secret'));
    expect(await reasonFor(hmac)).toBe('bad_signature');
  });

  it('rejects an expired token', async () => {
    expect(await reasonFor(await firebase.idToken({ expiresInSeconds: -60 }))).toBe('expired');
  });

  it('rejects a token issued for another Firebase project', async () => {
    expect(await reasonFor(await firebase.idToken({ projectId: 'someone-elses-project' }))).toBe(
      'wrong_project',
    );
  });

  it('rejects a token without a phone number, or from a sign-in that was not by phone', async () => {
    expect(await reasonFor(await firebase.idToken({ phone: null }))).toBe('no_phone_number');
    // An email/password account can carry a linked number; that is not a fresh SMS check.
    expect(await reasonFor(await firebase.idToken({ provider: 'password' }))).toBe(
      'not_phone_sign_in',
    );
    expect(await reasonFor(await firebase.idToken({ provider: 'anonymous', phone: null }))).toBe(
      'not_phone_sign_in',
    );
  });

  it('rejects numbers outside the supported country', async () => {
    expect(await reasonFor(await firebase.idToken({ phone: '+14155550123' }))).toBe(
      'unsupported_number',
    );
    expect(await reasonFor(await firebase.idToken({ phone: '+911234567890' }))).toBe(
      'unsupported_number',
    );
  });

  it('rejects a genuine token that is exchanged too long after the SMS check', async () => {
    const token = await firebase.idToken({ verifiedSecondsAgo: 301 });
    expect(await reasonFor(token)).toBe('too_old');
    // …while the same age is fine under a longer limit, so it is the age that was refused.
    await expect(firebase.verifier({ maxAgeSeconds: 600 }).verify(token)).resolves.toMatchObject({
      phone: '+919876543210',
    });
  });

  it('rejects a token without a user ID, and things that are not tokens', async () => {
    expect(await reasonFor(await firebase.idToken({ uid: null }))).toBe('malformed');
    for (const junk of ['', 'not-a-token', 'a.b.c', 'x'.repeat(500)]) {
      expect(['malformed', 'bad_signature']).toContain(await reasonFor(junk));
    }
  });

  it('reports that keys are unavailable when Google cannot be reached, without accepting anything', async () => {
    const offline = firebase.verifier({
      keys: () => Promise.reject(new TypeError('fetch failed')),
    });
    expect(await reasonFor(await firebase.idToken(), offline)).toBe('keys_unavailable');
  });

  it('never puts the token in its error', async () => {
    const token = await firebase.forgedIdToken();
    const error = (await firebase
      .verifier()
      .verify(token)
      .catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain(token);
    expect(JSON.stringify(error)).not.toContain(token.slice(0, 40));
  });
});
