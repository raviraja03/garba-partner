import { useState } from 'react';
import { useNavigate } from 'react-router';
import { APP_NAME } from '@garba-partner/shared';
import { ApiStatus } from '../components/ApiStatus';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { useAuth } from '../features/auth/auth-context';

const STATUS_NOTICE: Partial<Record<string, string>> = {
  suspended: 'Your account is currently suspended. Some features are unavailable.',
  pending_deletion: 'Your account is scheduled for deletion.',
};

/** Protected home. Profile onboarding, events and discovery arrive in later phases. */
export function HomePage() {
  const { state, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  if (state.status !== 'authenticated') return null;
  const { user } = state;
  const notice = STATUS_NOTICE[user.status];

  async function handleSignOut() {
    setSigningOut(true);
    await signOut().catch(() => undefined);
    await navigate('/login', { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <span className="text-lg font-bold text-brand-700">{APP_NAME}</span>
        <div className="flex items-center gap-3">
          <ApiStatus />
          <Button
            variant="link"
            loading={signingOut}
            onClick={() => {
              void handleSignOut();
            }}
          >
            Log out
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-6 py-12">
        <h1 className="text-4xl font-extrabold tracking-tight">
          {user.displayName ? `Welcome, ${user.displayName}!` : "You're logged in!"}
        </h1>
        {notice && <Alert tone="error">{notice}</Alert>}
        <section className="rounded-card bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h2 className="font-semibold text-brand-700">
            {user.onboardingStatus === 'complete' ? 'Your profile is ready' : 'Next: your profile'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            Profile setup, events and partner discovery are coming in the next releases.
          </p>
        </section>
      </main>
    </div>
  );
}
