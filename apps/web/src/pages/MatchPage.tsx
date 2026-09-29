import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { useMatch, useUnmatch } from '../features/connections/hooks';
import { SafetyActions } from '../features/partners/components/SafetyActions';
import { ProfileCard } from '../features/profile/components/ProfileCard';
import { formatTimestampDay } from '../lib/format';

/** One match. Opened with `state.celebrate` straight after matching. */
export function MatchPage() {
  const { matchId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const celebrate = (location.state as { celebrate?: boolean } | null)?.celebrate === true;
  const match = useMatch(matchId);
  const unmatch = useUnmatch();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="info">{done}</Alert>
        <Link to="/matches" className="font-semibold text-brand-700 hover:underline">
          ← Matches
        </Link>
      </div>
    );
  }
  if (match.isPending) return <FullPageSpinner />;
  if (match.isError) {
    return (
      <div className="space-y-4">
        <Alert tone="info">This match isn&apos;t available.</Alert>
        <Link to="/matches" className="font-semibold text-brand-700 hover:underline">
          ← Matches
        </Link>
      </div>
    );
  }

  const { partner, event, createdAt } = match.data;

  async function handleUnmatch() {
    if (
      !window.confirm(`Unmatch ${partner.name}? This can't be undone and they won't be told why.`)
    ) {
      return;
    }
    setError(null);
    try {
      await unmatch.mutateAsync(matchId);
      await navigate('/matches', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unmatch.');
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/matches" className="text-sm font-semibold text-brand-700 hover:underline">
        ← Matches
      </Link>
      <header className="rounded-card bg-gradient-to-br from-brand-500 to-accent-600 p-6 text-center text-white">
        <h1 className="text-3xl font-extrabold">
          {celebrate ? "It's a match!" : `You and ${partner.name}`}
        </h1>
        <p className="mt-1 text-sm text-white/90">
          You both said yes · {formatTimestampDay(createdAt)}
          {event && ` · for ${event.name}`}
        </p>
      </header>

      <ProfileCard profile={partner} />

      <section className="rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold">Chat is coming soon</h2>
        <p className="mt-1 text-sm text-muted">
          In-app chat is launching next. For your safety, keep conversations on Garba Partner,
          don&apos;t share your phone number or address, and meet at the event.
        </p>
        {event && (
          <Link
            to={`/events/${event.slug}`}
            className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline"
          >
            View {event.name}
          </Link>
        )}
      </section>

      <section className="rounded-card bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-200">
        <h2 className="font-semibold">Meet safely</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Meet at the event or another busy, public place.</li>
          <li>Tell a friend who you&apos;re meeting and where.</li>
          <li>Never send money or share OTPs, passwords or your home address.</li>
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="link" loading={unmatch.isPending} onClick={() => void handleUnmatch()}>
          Unmatch
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <SafetyActions userId={partner.id} name={partner.name} onDone={setDone} />
    </div>
  );
}
