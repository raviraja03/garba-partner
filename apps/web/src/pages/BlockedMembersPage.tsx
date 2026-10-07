import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingRegion, SkeletonRow } from '../components/ui/Skeleton';
import { useBlockedMembers, useUnblockMember } from '../features/safety/hooks';

const date = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }).format(
    new Date(iso),
  );

/** Members you blocked, with unblock (after a confirmation). */
export function BlockedMembersPage() {
  const blocked = useBlockedMembers();
  const unblock = useUnblockMember();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUnblock(userId: string) {
    setError(null);
    try {
      await unblock.mutateAsync(userId);
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unblock. Please try again.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blocked members"
        description="Blocked members can't see you or contact you, and you won't see them. They are never told."
        back={{ to: '/profile', label: 'My profile' }}
      />

      {blocked.isPending && (
        <LoadingRegion label="Loading blocked members…" className="space-y-3">
          <SkeletonRow />
          <SkeletonRow />
        </LoadingRegion>
      )}
      {blocked.isError && (
        <EmptyState tone="error" title="We couldn't load your blocked members">
          Check your connection and refresh the page.
        </EmptyState>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {blocked.data?.length === 0 && (
        <EmptyState icon="shield" title="You haven't blocked anyone">
          If someone makes you uncomfortable, you can block them from their profile or your chat.
        </EmptyState>
      )}

      {blocked.data && blocked.data.length > 0 && (
        <ul className="space-y-3">
          {blocked.data.map((member) => {
            const name = member.name ?? 'Former member';
            return (
              <Card as="li" key={member.userId} padding="sm">
                <div className="flex items-center gap-3">
                  <Avatar name={name} src={member.thumbnailUrl} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{name}</p>
                    <p className="text-caption text-muted">Blocked {date(member.blockedAt)}</p>
                  </div>
                  {confirming !== member.userId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth={false}
                      onClick={() => {
                        setConfirming(member.userId);
                      }}
                    >
                      Unblock
                    </Button>
                  )}
                </div>
                {confirming === member.userId && (
                  <div className="mt-3 space-y-3 border-t border-line pt-3">
                    <p className="text-small">
                      Unblock {name}? You may see each other again in Discover. Your earlier match
                      and chat stay closed.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button
                        variant="secondary"
                        className="sm:w-auto"
                        onClick={() => {
                          setConfirming(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="sm:w-auto"
                        loading={unblock.isPending}
                        onClick={() => void handleUnblock(member.userId)}
                      >
                        Unblock
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
