import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/ui/Avatar';
import { CountBadge } from '../components/ui/Badge';
import { Button, LinkButton } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { cx } from '../components/ui/cx';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingRegion, SkeletonRow } from '../components/ui/Skeleton';
import { useAuth } from '../features/auth/auth-context';
import { useChats } from '../features/chat/hooks';
import { formatTimestampDay } from '../lib/format';

/** Conversations with active matches, most recent activity first. */
export function ChatsPage() {
  const { state } = useAuth();
  const myId = state.status === 'authenticated' ? state.user.id : '';
  const list = useChats();
  const chats = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Chats" description="Conversations with your matches." />
      {list.isError && (
        <EmptyState
          tone="error"
          title="We couldn't load your chats"
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
        <LoadingRegion label="Loading chats…" className="space-y-3">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </LoadingRegion>
      )}
      {list.isSuccess && chats.length === 0 && (
        <EmptyState
          icon="chat"
          title="No chats yet"
          action={<LinkButton to="/discover">Discover partners</LinkButton>}
        >
          A chat opens when you and another member both say yes.
        </EmptyState>
      )}
      {chats.length > 0 && (
        <Card padding="none">
          <ul className="divide-y divide-line">
            {chats.map((chat) => {
              const unread = chat.unreadCount > 0;
              return (
                <li key={chat.matchId}>
                  <Link
                    to={`/chats/${chat.matchId}`}
                    className="flex min-h-18 items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-50"
                  >
                    <Avatar
                      name={chat.partner.name}
                      src={chat.partner.image?.thumbnailUrl}
                      size="lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cx(
                            'truncate text-ink',
                            unread ? 'font-bold' : 'font-semibold',
                          )}
                        >
                          {chat.partner.name}
                        </span>
                        <span
                          className={cx(
                            'shrink-0 text-caption',
                            unread ? 'font-semibold text-accent-700' : 'text-muted',
                          )}
                        >
                          {formatTimestampDay(chat.lastActivityAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cx(
                            'truncate text-small',
                            unread ? 'font-medium text-ink' : 'text-muted',
                          )}
                        >
                          {chat.lastMessage
                            ? `${chat.lastMessage.senderId === myId ? 'You: ' : ''}${chat.lastMessage.body}`
                            : 'Say hello 👋'}
                        </span>
                        <CountBadge
                          count={chat.unreadCount}
                          label={`${String(chat.unreadCount)} unread`}
                        />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
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
