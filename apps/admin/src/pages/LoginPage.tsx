import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  APP_NAME,
  type AdminLoginChallengeDto,
  type AdminTotpSetupDto,
} from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { login, setupTwoFactor, verifyTwoFactor } from '../features/auth/auth-api';
import { useAdminAuth } from '../features/auth/auth-context';
import { ApiClientError } from '../lib/api-client';

const INPUT_CLASS =
  'mt-1 w-full rounded-xl px-4 py-3 ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-brand-600';

/** "ABCD EFGH …" for manual entry in an authenticator app. */
const groupSecret = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

/**
 * Admin sign-in in two steps (docs/security/security-best-practices.md): email + password, then
 * a 6-digit code from an authenticator app. On the first sign-in the admin adds the account to
 * their authenticator app before entering the code.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const { signIn } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<AdminLoginChallengeDto | null>(null);
  const [setup, setSetup] = useState<AdminTotpSetupDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function restart(message: string | null) {
    setChallenge(null);
    setSetup(null);
    setCode('');
    setPassword('');
    setError(message);
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const next = await login({ email, password });
      setPassword('');
      setChallenge(next);
      if (next.method === 'setup') setSetup(await setupTwoFactor(next.challengeToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setSubmitting(true);
    setError(null);
    try {
      signIn(await verifyTwoFactor(challenge.challengeToken, code.trim()));
      await navigate(from ?? '/', { replace: true });
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : null;
      if (code === 'MFA_CHALLENGE_INVALID' || code === 'ACCOUNT_LOCKED') {
        restart(err instanceof Error ? err.message : 'Please sign in again.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        setCode('');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <main className="w-full max-w-sm rounded-card bg-white p-8 shadow-sm ring-1 ring-black/5">
        <p className="font-bold text-brand-700">{APP_NAME}</p>
        <h1 className="mt-1 text-2xl font-extrabold">Admin sign in</h1>
        <p className="mt-1 text-sm text-muted">Authorised staff only. All actions are logged.</p>

        {!challenge ? (
          <form onSubmit={(event) => void handlePassword(event)} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                className={INPUT_CLASS}
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-semibold">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                className={INPUT_CLASS}
                required
              />
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" loading={submitting}>
              Continue
            </Button>
          </form>
        ) : (
          <form onSubmit={(event) => void handleCode(event)} className="mt-6 space-y-4">
            {challenge.method === 'setup' ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold">Set up two-factor sign-in</p>
                <p className="text-muted">
                  Add this account to an authenticator app (Google Authenticator, Microsoft
                  Authenticator, 1Password…), then enter the 6-digit code it shows.
                </p>
                {setup ? (
                  <>
                    <p className="rounded-xl bg-black/5 px-3 py-2 font-mono text-sm break-all">
                      {groupSecret(setup.secret)}
                    </p>
                    <a
                      href={setup.otpauthUri}
                      className="inline-block font-semibold text-brand-700 hover:underline"
                    >
                      Open in authenticator app (on this device)
                    </a>
                    <p className="text-xs text-muted">
                      Keep this key private. Losing your phone? A super admin can reset your
                      two-factor sign-in.
                    </p>
                  </>
                ) : (
                  <p className="text-muted">Loading…</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">
                Enter the 6-digit code from your authenticator app.
              </p>
            )}
            <div>
              <label htmlFor="code" className="block text-sm font-semibold">
                Authentication code
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, ''));
                }}
                className={`${INPUT_CLASS} tracking-widest`}
                required
              />
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" loading={submitting} disabled={code.length !== 6}>
              Sign in
            </Button>
            <Button
              variant="link"
              onClick={() => {
                restart(null);
              }}
            >
              Use a different account
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
