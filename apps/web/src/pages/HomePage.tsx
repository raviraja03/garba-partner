import { Link } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { useAuth } from '../features/auth/auth-context';
import { CompletionCard } from '../features/profile/components/CompletionCard';
import { useMyProfile } from '../features/profile/hooks';

const STATUS_NOTICE: Partial<Record<string, string>> = {
  suspended:
    'Your account is currently suspended. You can still update your profile, but other features are unavailable.',
  pending_deletion: 'Your account is scheduled for deletion.',
};

/** Signed-in home. Partner discovery arrives in a later phase. */
export function HomePage() {
  const { state } = useAuth();
  const myProfile = useMyProfile();
  if (state.status !== 'authenticated') return null;

  const { user } = state;
  const notice = STATUS_NOTICE[user.status];
  const completion = myProfile.data?.completion;

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-extrabold tracking-tight">
        {user.displayName ? `Welcome, ${user.displayName}!` : 'Welcome!'}
      </h1>
      {notice && <Alert tone="error">{notice}</Alert>}
      {completion && <CompletionCard completion={completion} />}
      {completion && completion.status !== 'complete' ? (
        <Link
          to={myProfile.data?.profile?.image ? '/profile/edit' : '/onboarding'}
          className="inline-block rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
        >
          Finish your profile
        </Link>
      ) : (
        <section className="rounded-card bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h2 className="font-semibold text-brand-700">You're all set</h2>
          <p className="mt-2 text-sm text-muted">
            Partner discovery is coming in the next release. In the meantime, see what&apos;s on.
          </p>
        </section>
      )}
      <Link
        to="/events"
        className="inline-block rounded-xl bg-white px-5 py-3 font-semibold ring-1 ring-black/10 hover:bg-brand-50"
      >
        Browse Garba events
      </Link>
    </div>
  );
}
