import { Link } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
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
    <div className="space-y-5">
      <h1 className="text-3xl font-extrabold tracking-tight">Chats</h1>
      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      {list.isPending && (
        <p role="status" className="text-sm text-muted">
          Loading…
        </p>
      )}
      {!list.isPending && chats.length === 0 && (
        <section className="rounded-card bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
          <p className="text-sm text-muted">
            No chats yet. A chat opens when you and another member both say yes.
          </p>
          <Link to="/discover" className="mt-3 inline-block font-semibold text-brand-700">
            Discover partners
          </Link>
        </section>
      )}
      <ul className="divide-y divide-black/5 overflow-hidden rounded-card bg-white shadow-sm ring-1 ring-black/5">
        {chats.map((chat) => (
          <li key={chat.matchId}>
            <Link
              to={`/chats/${chat.matchId}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50/50"
            >
              {chat.partner.image ? (
                <img
                  src={chat.partner.image.thumbnailUrl}
                  alt=""
                  className="size-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="size-12 shrink-0 rounded-full bg-brand-50" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span
                    className={`truncate ${chat.unreadCount > 0 ? 'font-bold' : 'font-semibold'}`}
                  >
                    {chat.partner.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {formatTimestampDay(chat.lastActivityAt)}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-sm ${chat.unreadCount > 0 ? 'text-ink' : 'text-muted'}`}
                  >
                    {chat.lastMessage
                      ? `${chat.lastMessage.senderId === myId ? 'You: ' : ''}${chat.lastMessage.body}`
                      : 'Say hello 👋'}
                  </span>
                  {chat.unreadCount > 0 && (
                    <span
                      className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white"
                      aria-label={`${String(chat.unreadCount)} unread`}
                    >
                      {chat.unreadCount}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
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
