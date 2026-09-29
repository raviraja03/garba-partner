import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { PartnerDto } from '@garba-partner/shared';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import {
  useAcceptInterest,
  useRejectInterest,
  useSendInterest,
  useWithdrawInterest,
} from '../hooks';

/**
 * The interest call-to-action on a partner profile, driven by the server's `connection`:
 * none → Send interest; sent → pending + Withdraw; received → Accept / Decline; matched → View.
 * Nobody can message anyone until both have said yes.
 */
export function InterestActions({ partner }: { partner: PartnerDto }) {
  const { profile, connection, sharedEvents } = partner;
  const navigate = useNavigate();
  const send = useSendInterest();
  const accept = useAcceptInterest();
  const reject = useRejectInterest();
  const withdraw = useWithdrawInterest();
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  async function run(task: () => Promise<void>) {
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  const openMatch = (matchId: string) =>
    navigate(`/matches/${matchId}`, { state: { celebrate: true } });

  if (declined) {
    return <Alert tone="info">Declined. {profile.name} won&apos;t be told.</Alert>;
  }

  return (
    <section aria-label="Interest" className="space-y-3">
      {connection.status === 'none' && (
        <>
          <Button
            loading={send.isPending}
            onClick={() =>
              void run(async () => {
                const result = await send.mutateAsync({
                  receiverId: profile.id,
                  // Mention the shared event, if any (both are looking for a partner there).
                  ...(sharedEvents[0] ? { eventId: sharedEvents[0].id } : {}),
                });
                if (result.match) await openMatch(result.match.id);
              })
            }
          >
            Send interest
          </Button>
          <p className="text-xs text-muted">
            {profile.name} can accept or decline. A chat opens only if you both say yes.
          </p>
        </>
      )}

      {connection.status === 'interest_sent' && connection.interestId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
          <p className="text-sm">
            <strong>Interest sent.</strong> Waiting for {profile.name} to reply.
          </p>
          <Button
            variant="link"
            loading={withdraw.isPending}
            onClick={() => void run(() => withdraw.mutateAsync(connection.interestId ?? '').then())}
          >
            Withdraw
          </Button>
        </div>
      )}

      {connection.status === 'interest_received' && connection.interestId && (
        <div className="space-y-3 rounded-card bg-brand-50 p-4 ring-1 ring-brand-200">
          <p className="text-sm font-semibold text-brand-900">
            {profile.name} is interested in dancing with you.
          </p>
          <div className="flex gap-3">
            <Button
              className="w-auto! px-6"
              loading={accept.isPending}
              onClick={() =>
                void run(async () => {
                  const match = await accept.mutateAsync(connection.interestId ?? '');
                  await openMatch(match.id);
                })
              }
            >
              Accept
            </Button>
            <Button
              variant="secondary"
              className="w-auto! px-6"
              loading={reject.isPending}
              onClick={() =>
                void run(async () => {
                  await reject.mutateAsync(connection.interestId ?? '');
                  setDeclined(true);
                })
              }
            >
              Decline
            </Button>
          </div>
        </div>
      )}

      {connection.status === 'matched' && connection.matchId && (
        <Link
          to={`/matches/${connection.matchId}`}
          className="block rounded-xl bg-brand-600 px-4 py-3 text-center font-semibold text-white hover:bg-brand-700"
        >
          You matched: view match
        </Link>
      )}

      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
