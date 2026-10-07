import { PageHeader } from '../components/PageHeader';
import { Button, LinkButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { LoadingRegion, SkeletonRow } from '../components/ui/Skeleton';
import { MemberRow } from '../features/connections/components/MemberRow';
import { useMatches } from '../features/connections/hooks';
import { formatTimestampDay } from '../lib/format';

/** The member's active matches, newest first. */
export function MatchesPage() {
  const list = useMatches();
  const matches = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Matches" description="People you and they both said yes to." />
      {list.isError && (
        <EmptyState
          tone="error"
          title="We couldn't load your matches"
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
        <LoadingRegion label="Loading matches…" className="space-y-3">
          <SkeletonRow />
          <SkeletonRow />
        </LoadingRegion>
      )}
      {list.isSuccess && matches.length === 0 && (
        <EmptyState
          icon="users"
          title="No matches yet"
          action={<LinkButton to="/discover">Discover partners</LinkButton>}
        >
          When someone accepts your interest (or you accept theirs), they appear here.
        </EmptyState>
      )}
      {matches.length > 0 && (
        <ul className="space-y-3">
          {matches.map((match) => (
            <MemberRow
              key={match.id}
              member={match.partner}
              to={`/matches/${match.id}`}
              event={match.event}
              note={`Matched ${formatTimestampDay(match.createdAt)}`}
            >
              <LinkButton to={`/chats/${match.id}`} size="sm" fullWidth className="sm:w-auto">
                <Icon name="chat" className="size-4.5" />
                Message
              </LinkButton>
            </MemberRow>
          ))}
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
  );
}
