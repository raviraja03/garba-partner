import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { InterestDto } from '@garba-partner/shared';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Button, LinkButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingRegion, SkeletonRow } from '../components/ui/Skeleton';
import { Tabs } from '../components/ui/Tabs';
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
        size="sm"
        className="sm:w-auto"
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
        size="sm"
        className="sm:w-auto"
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
        variant="secondary"
        size="sm"
        className="sm:w-auto"
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
  const countOf = (query: typeof received) =>
    query.data?.pages.reduce((total, page) => total + page.items.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interests"
        description="A chat opens only when you both say yes. Declining is private: nobody is told."
      />
      <Tabs
        label="Interests"
        value={tab}
        onChange={(value) => {
          setParams(value === 'sent' ? { tab: 'sent' } : {}, { replace: true });
          setError(null);
        }}
        items={[
          { value: 'received', label: 'Received', count: countOf(received) },
          { value: 'sent', label: 'Sent', count: countOf(sent) },
        ]}
      />

      <div
        role="tabpanel"
        aria-label={tab === 'received' ? 'Received' : 'Sent'}
        className="space-y-4"
      >
        {error && <Alert tone="error">{error}</Alert>}
        {list.isError && (
          <EmptyState
            tone="error"
            title="We couldn't load your interests"
            action={
              <Button variant="secondary" fullWidth={false} onClick={() => void list.refetch()}>
                Try again
              </Button>
            }
          >
            {list.error.message}
          </EmptyState>
        )}
        {list.isPending && (
          <LoadingRegion label="Loading interests…" className="space-y-3">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </LoadingRegion>
        )}
        {list.isSuccess && interests.length === 0 && (
          <EmptyState
            icon="heart"
            title={tab === 'received' ? 'No new interests right now' : 'No pending interests'}
            action={<LinkButton to="/discover">Discover partners</LinkButton>}
          >
            {tab === 'received'
              ? 'When someone wants to dance with you, they appear here.'
              : 'Find someone to dance with on Discover and send them an interest.'}
          </EmptyState>
        )}

        {interests.length > 0 && (
          <ul className="space-y-3">
            {interests.map((interest) =>
              tab === 'received' ? (
                <ReceivedRow key={interest.id} interest={interest} onError={setError} />
              ) : (
                <SentRow key={interest.id} interest={interest} onError={setError} />
              ),
            )}
          </ul>
        )}

        {list.hasNextPage && (
          <div className="flex justify-center">
            <Button
              variant="secondary"
              fullWidth={false}
              loading={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              Show more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
