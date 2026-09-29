import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FullPageSpinner } from '../components/FullPageSpinner';
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

  if (blocked.isPending) return <FullPageSpinner />;

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
    <div className="space-y-4">
      <header className="space-y-1">
        <Link to="/profile" className="text-sm font-semibold text-brand-700">
          ← My profile
        </Link>
        <h1 className="text-2xl font-bold">Blocked members</h1>
        <p className="text-sm text-muted">
          Blocked members can&apos;t see you or contact you, and you won&apos;t see them. They are
          never told.
        </p>
      </header>
      {blocked.error && <Alert tone="error">Could not load blocked members.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {blocked.data?.length === 0 && <Alert tone="info">You haven&apos;t blocked anyone.</Alert>}
      <ul className="space-y-2">
        {blocked.data?.map((member) => {
          const name = member.name ?? 'Former member';
          return (
            <li
              key={member.userId}
              className="flex flex-wrap items-center gap-3 rounded-card bg-white p-3 shadow-sm ring-1 ring-black/5"
            >
              {member.thumbnailUrl ? (
                <img
                  src={member.thumbnailUrl}
                  alt=""
                  className="size-10 rounded-full object-cover"
                />
              ) : (
                <span className="size-10 rounded-full bg-brand-50" aria-hidden="true" />
              )}
              <div className="flex-1">
                <p className="font-semibold">{name}</p>
                <p className="text-xs text-muted">Blocked {date(member.blockedAt)}</p>
              </div>
              {confirming === member.userId ? (
                <div className="w-full space-y-2 text-sm">
                  <p>
                    Unblock {name}? You may see each other again in Discover. Your earlier match and
                    chat stay closed.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      className="w-auto! px-4"
                      loading={unblock.isPending}
                      onClick={() => void handleUnblock(member.userId)}
                    >
                      Unblock
                    </Button>
                    <Button
                      variant="link"
                      onClick={() => {
                        setConfirming(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="link"
                  onClick={() => {
                    setConfirming(member.userId);
                  }}
                >
                  Unblock
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
