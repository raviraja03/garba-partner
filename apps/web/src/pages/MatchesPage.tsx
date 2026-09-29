import { Link } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { MemberRow } from '../features/connections/components/MemberRow';
import { useMatches } from '../features/connections/hooks';
import { formatTimestampDay } from '../lib/format';

/** The member's active matches, newest first. */
export function MatchesPage() {
  const list = useMatches();
  const matches = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-extrabold tracking-tight">Matches</h1>
      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      {list.isPending && (
        <p role="status" className="text-sm text-muted">
          Loading…
        </p>
      )}
      {!list.isPending && matches.length === 0 && (
        <section className="rounded-card bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
          <p className="text-sm text-muted">
            No matches yet. When someone accepts your interest (or you accept theirs), they appear
            here.
          </p>
          <Link to="/discover" className="mt-3 inline-block font-semibold text-brand-700">
            Discover partners
          </Link>
        </section>
      )}
      <ul className="space-y-3">
        {matches.map((match) => (
          <MemberRow
            key={match.id}
            member={match.partner}
            to={`/matches/${match.id}`}
            event={match.event}
            note={`Matched ${formatTimestampDay(match.createdAt)}`}
          />
        ))}
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
