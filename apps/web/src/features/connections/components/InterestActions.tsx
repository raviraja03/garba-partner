import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { PartnerDto } from '@garba-partner/shared';
import { Alert } from '../../../components/ui/Alert';
import { Button, LinkButton } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Icon } from '../../../components/ui/Icon';
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
            variant="cta"
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
            <Icon name="heart" />
            Send interest
          </Button>
          <p className="text-center text-caption text-muted">
            {profile.name} can accept or decline. A chat opens only if you both say yes.
          </p>
        </>
      )}

      {connection.status === 'interest_sent' && connection.interestId && (
        <Card padding="sm" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="flex items-center gap-2 text-small">
            <Icon name="check" className="size-5 text-success" />
            <span>
              <strong>Interest sent.</strong> Waiting for {profile.name} to reply.
            </span>
          </p>
          <Button
            variant="link"
            loading={withdraw.isPending}
            onClick={() => void run(() => withdraw.mutateAsync(connection.interestId ?? '').then())}
          >
            Withdraw
          </Button>
        </Card>
      )}

      {connection.status === 'interest_received' && connection.interestId && (
        <div className="space-y-3 rounded-card bg-accent-50 p-4 ring-1 ring-accent-200">
          <p className="flex items-center gap-2 font-semibold text-accent-700">
            <Icon name="heart" />
            {profile.name} is interested in dancing with you.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button
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
        <LinkButton to={`/matches/${connection.matchId}`} variant="cta" fullWidth>
          <Icon name="users" />
          You matched: view match
        </LinkButton>
      )}

      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
