import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { APP_NAME } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { login } from '../features/auth/auth-api';
import { useAdminAuth } from '../features/auth/auth-context';

const INPUT_CLASS =
  'mt-1 w-full rounded-xl px-4 py-3 ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-brand-600';

/** Admin sign-in with email + password. */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const { signIn } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      signIn(await login({ email, password }));
      await navigate(from ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <main className="w-full max-w-sm rounded-card bg-white p-8 shadow-sm ring-1 ring-black/5">
        <img
          src="/brand/logo.webp"
          width={723}
          height={192}
          alt={APP_NAME}
          className="mb-4 h-12 w-auto"
        />
        <h1 className="mt-1 text-2xl font-extrabold">Admin sign in</h1>
        <p className="mt-1 text-sm text-muted">Authorised staff only. All actions are logged.</p>

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
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
            Sign in
          </Button>
        </form>
      </main>
    </div>
  );
}
