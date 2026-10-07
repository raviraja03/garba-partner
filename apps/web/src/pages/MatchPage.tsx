import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button, LinkButton } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { LoadingRegion, Skeleton, SkeletonCard } from '../components/ui/Skeleton';
import { useMatch, useUnmatch } from '../features/connections/hooks';
import { SafetyActions } from '../features/partners/components/SafetyActions';
import { ProfileCard } from '../features/profile/components/ProfileCard';
import { formatTimestampDay } from '../lib/format';
import { BACK_LINK } from '../components/ui/link-styles';

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
  const [confirmingUnmatch, setConfirmingUnmatch] = useState(false);

  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="sr-only">Done</h1>
        <Alert tone="success">{done}</Alert>
        <LinkButton to="/matches" variant="secondary">
          <Icon name="arrow-left" className="size-4" />
          Back to matches
        </LinkButton>
      </div>
    );
  }
  if (match.isPending) {
    return (
      <LoadingRegion label="Loading match…" className="space-y-4">
        <h1 className="sr-only">Loading match</h1>
        <Skeleton className="h-36 w-full rounded-card" />
        <div className="grid gap-6 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <SkeletonCard aspect="aspect-[4/5]" />
          <Skeleton className="h-48 w-full rounded-card" />
        </div>
      </LoadingRegion>
    );
  }
  if (match.isError) {
    return (
      <EmptyState
        icon="users"
        title="This match isn't available"
        action={<LinkButton to="/matches">Back to matches</LinkButton>}
      >
        <h1 className="sr-only">Match not available</h1>
        It may have ended.
      </EmptyState>
    );
  }

  const { partner, event, createdAt } = match.data;

  async function handleUnmatch() {
    setConfirmingUnmatch(false);
    setError(null);
    try {
      await unmatch.mutateAsync(matchId);
      await navigate('/matches', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unmatch.');
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/matches" className={BACK_LINK}>
        <Icon name="arrow-left" className="size-4" />
        Matches
      </Link>

      <header className="relative overflow-hidden rounded-card bg-primary px-5 py-8 text-center text-white shadow-raised">
        <span
          aria-hidden="true"
          className="absolute -top-16 -left-10 size-56 rounded-full bg-secondary/35 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="absolute -right-10 -bottom-20 size-56 rounded-full bg-accent-orange/30 blur-3xl"
        />
        <div className="relative">
          {celebrate && (
            <p className="mb-1 text-label tracking-widest text-accent-yellow uppercase">
              You both said yes
            </p>
          )}
          <h1 className={celebrate ? 'text-display text-white' : 'text-h1 text-white'}>
            {celebrate ? "It's a match!" : `You and ${partner.name}`}
          </h1>
          <p className="mt-2 text-small text-white/85">
            Matched {formatTimestampDay(createdAt)}
            {event && ` · for ${event.name}`}
          </p>
        </div>
      </header>

      <div className="grid items-start gap-6 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <ProfileCard profile={partner} heading="h2" />

        <div className="space-y-5">
          <Card className="space-y-3">
            <LinkButton to={`/chats/${matchId}`} variant="cta" fullWidth>
              <Icon name="chat" />
              Open chat
            </LinkButton>
            <p className="text-small text-muted">
              For your safety, keep conversations on GarbaMates, don&apos;t share your phone number
              or address until you trust someone, and meet at the event.
            </p>
            {event && (
              <LinkButton to={`/events/${event.slug}`} variant="secondary" fullWidth>
                <Icon name="calendar" className="size-4.5" />
                View {event.name}
              </LinkButton>
            )}
          </Card>

          <section className="rounded-card bg-accent-yellow-soft p-5 text-primary ring-1 ring-accent-yellow/50">
            <h2 className="flex items-center gap-2 text-h3 text-primary">
              <Icon name="shield" />
              Meet safely
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-small">
              <li>Meet at the event or another busy, public place.</li>
              <li>Tell a friend who you&apos;re meeting and where.</li>
              <li>Never send money or share OTPs, passwords or your home address.</li>
            </ul>
          </section>

          {error && <Alert tone="error">{error}</Alert>}
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              fullWidth={false}
              loading={unmatch.isPending}
              onClick={() => {
                setConfirmingUnmatch(true);
              }}
            >
              <Icon name="close" className="size-4.5" />
              Unmatch
            </Button>
            <SafetyActions userId={partner.id} name={partner.name} onDone={setDone} />
          </div>
        </div>
      </div>

      <Modal
        open={confirmingUnmatch}
        onClose={() => {
          setConfirmingUnmatch(false);
        }}
        title={`Unmatch ${partner.name}?`}
        description="This ends the match and closes your chat. It can't be undone, and they won't be told why."
        footer={
          <>
            <Button
              variant="secondary"
              className="sm:w-auto"
              onClick={() => {
                setConfirmingUnmatch(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" className="sm:w-auto" onClick={() => void handleUnmatch()}>
              Unmatch
            </Button>
          </>
        }
      />
    </div>
  );
}
