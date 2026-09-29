import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { InterestDto } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { MemberRow } from '../features/connections/components/MemberRow';
import {
  useAcceptInterest,
  useReceivedInterests,
  useRejectInterest,
  useSentInterests,
  useWithdrawInterest,
} from '../features/connections/hooks';
import { formatTimestampDay } from '../lib/format';

type Tab = 'received' | 'sent';

function ReceivedRow({
  interest,
  onError,
}: {
  interest: InterestDto;
  onError: (m: string) => void;
}) {
  const navigate = useNavigate();
  const accept = useAcceptInterest();
  const reject = useRejectInterest();
  const busy = accept.isPending || reject.isPending;
  return (
    <MemberRow
      member={interest.member}
      to={`/partners/${interest.member.id}`}
      event={interest.event}
    >
      <Button
        className="w-auto! px-4 py-2! text-sm"
        loading={accept.isPending}
        disabled={busy}
        onClick={() => {
          accept
            .mutateAsync(interest.id)
            .then((match) => navigate(`/matches/${match.id}`, { state: { celebrate: true } }))
            .catch((err: unknown) => {
              onError(err instanceof Error ? err.message : 'Could not accept.');
            });
        }}
      >
        Accept
      </Button>
      <Button
        variant="secondary"
        className="w-auto! px-4 py-2! text-sm"
        loading={reject.isPending}
        disabled={busy}
        onClick={() => {
          reject.mutateAsync(interest.id).catch((err: unknown) => {
            onError(err instanceof Error ? err.message : 'Could not decline.');
          });
        }}
      >
        Decline
      </Button>
    </MemberRow>
  );
}

function SentRow({ interest, onError }: { interest: InterestDto; onError: (m: string) => void }) {
  const withdraw = useWithdrawInterest();
  return (
    <MemberRow
      member={interest.member}
      to={`/partners/${interest.member.id}`}
      event={interest.event}
      note={`Waiting for a reply · open until ${formatTimestampDay(interest.expiresAt)}`}
    >
      <Button
        variant="link"
        loading={withdraw.isPending}
        onClick={() => {
          withdraw.mutateAsync(interest.id).catch((err: unknown) => {
            onError(err instanceof Error ? err.message : 'Could not withdraw.');
          });
        }}
      >
        Withdraw
      </Button>
    </MemberRow>
  );
}

/** Received and Sent interests. Declined interests simply disappear (nobody is told). */
export function InterestsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'sent' ? 'sent' : 'received';
  const received = useReceivedInterests();
  const sent = useSentInterests();
  const list = tab === 'received' ? received : sent;
  const interests = list.data?.pages.flatMap((page) => page.items) ?? [];
  const [error, setError] = useState<string | null>(null);

  const tabClass = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-black/10'}`;

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-extrabold tracking-tight">Interests</h1>
      <div role="tablist" aria-label="Interests" className="flex gap-2">
        {(['received', 'sent'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tabClass(tab === value)}
            onClick={() => {
              setParams(value === 'sent' ? { tab: 'sent' } : {}, { replace: true });
              setError(null);
            }}
          >
            {value === 'received' ? 'Received' : 'Sent'}
          </button>
        ))}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      {list.isPending && (
        <p role="status" className="text-sm text-muted">
          Loading…
        </p>
      )}
      {!list.isPending && interests.length === 0 && (
        <section className="rounded-card bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
          <p className="text-sm text-muted">
            {tab === 'received'
              ? 'No new interests right now.'
              : 'No pending interests. Find someone to dance with on Discover.'}
          </p>
          <Link to="/discover" className="mt-3 inline-block font-semibold text-brand-700">
            Discover partners
          </Link>
        </section>
      )}

      <ul className="space-y-3">
        {interests.map((interest) =>
          tab === 'received' ? (
            <ReceivedRow key={interest.id} interest={interest} onError={setError} />
          ) : (
            <SentRow key={interest.id} interest={interest} onError={setError} />
          ),
        )}
      </ul>

      {list.hasNextPage && (
        <Button
          variant="secondary"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </div>
  );
}
