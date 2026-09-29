import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  LIMITS,
  looksLikeContactDetails,
  looksLikeMoneyRequest,
  type MessageDto,
  type ReportReason,
} from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { useAuth } from '../features/auth/auth-context';
import {
  useChat,
  useChatConnected,
  useMarkRead,
  useMessages,
  useSendMessage,
} from '../features/chat/hooks';
import { ReportForm } from '../features/partners/components/ReportForm';
import { SafetyActions } from '../features/partners/components/SafetyActions';
import { MoneyWarning } from '../features/safety/components/MoneyWarning';
import { useMySafety } from '../features/safety/hooks';
import { ApiClientError } from '../lib/api-client';

const time = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

function Unavailable({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <Alert tone="info">{message}</Alert>
      <Link to="/chats" className="font-semibold text-brand-700 hover:underline">
        ← Chats
      </Link>
    </div>
  );
}

/**
 * One conversation. Messages render as plain text (never HTML). The server enforces every rule;
 * this screen reflects them: an ended chat closes, blocked/reported chats disappear.
 */
export function ChatPage() {
  const { matchId = '' } = useParams();
  const { state } = useAuth();
  const myId = state.status === 'authenticated' ? state.user.id : '';
  const chat = useChat(matchId);
  const messages = useMessages(matchId);
  const send = useSendMessage(matchId);
  const markRead = useMarkRead(matchId);
  const connected = useChatConnected();
  const [draft, setDraft] = useState('');
  const [nudge, setNudge] = useState<'contact' | 'money' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<{
    message: MessageDto;
    reason?: ReportReason;
  } | null>(null);
  const safety = useMySafety(true);
  const chatRestricted = safety.data?.chatRestricted ?? false;
  const [done, setDone] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMarked = useRef<string | null>(null);

  // Oldest → newest for display (pages are newest-first).
  const ordered = useMemo(
    () => (messages.data?.pages.flatMap((page) => page.items) ?? []).slice().reverse(),
    [messages.data],
  );
  const newest = ordered.at(-1);
  const newestFromPartner = [...ordered].reverse().find((m) => m.senderId !== myId);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [newest?.id]);

  // Read receipt: when the newest partner message is on screen and the tab is visible.
  useEffect(() => {
    if (!newestFromPartner || lastMarked.current === newestFromPartner.id) return;
    if (document.visibilityState !== 'visible') return;
    lastMarked.current = newestFromPartner.id;
    markRead.mutate(newestFromPartner.id);
  }, [newestFromPartner, markRead]);

  if (done) return <Unavailable message={done} />;
  if (chat.isPending || messages.isPending) return <FullPageSpinner />;
  const loadError = chat.error ?? messages.error;
  if (loadError) {
    const ended = loadError instanceof ApiClientError && loadError.code === 'MATCH_NOT_ACTIVE';
    return (
      <Unavailable
        message={ended ? 'This chat is no longer available.' : 'This chat could not be found.'}
      />
    );
  }
  if (!chat.data) return <FullPageSpinner />;
  const { partner, partnerLastReadAt } = chat.data;
  const lastMine = [...ordered].reverse().find((m) => m.senderId === myId);
  const seen = lastMine && partnerLastReadAt !== null && partnerLastReadAt >= lastMine.createdAt;

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    // Nudges: not a block, just a moment to think before sending.
    if (!nudge) {
      if (looksLikeMoneyRequest(body)) {
        setNudge('money');
        return;
      }
      if (looksLikeContactDetails(body)) {
        setNudge('contact');
        return;
      }
    }
    setError(null);
    try {
      await send.mutateAsync(body);
      setDraft('');
      setNudge(null);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'MATCH_NOT_ACTIVE') {
        setDone('This chat is no longer available.');
        return;
      }
      if (err instanceof ApiClientError && err.code === 'CHAT_RESTRICTED') {
        void safety.refetch();
      }
      setError(err instanceof Error ? err.message : 'Message not sent. Please try again.');
    }
  }

  return (
    <div className="flex min-h-[70dvh] flex-col gap-4">
      <header className="flex items-center gap-3">
        <Link
          to="/chats"
          className="text-sm font-semibold text-brand-700"
          aria-label="Back to chats"
        >
          ←
        </Link>
        <Link to={`/partners/${partner.id}`} className="flex items-center gap-3">
          {partner.image ? (
            <img
              src={partner.image.thumbnailUrl}
              alt=""
              className="size-10 rounded-full object-cover"
            />
          ) : (
            <span className="size-10 rounded-full bg-brand-50" aria-hidden="true" />
          )}
          <span className="font-semibold">{partner.name}</span>
        </Link>
        {!connected && (
          <span className="ml-auto text-xs text-muted" role="status">
            Reconnecting…
          </span>
        )}
      </header>

      <aside className="rounded-card bg-brand-50 p-3 text-xs text-brand-900 ring-1 ring-brand-200">
        Meet at the event or another busy public place. Tell a friend your plans. Never send money
        or share OTPs.
      </aside>

      {messages.hasNextPage && (
        <Button
          variant="link"
          loading={messages.isFetchingNextPage}
          onClick={() => void messages.fetchNextPage()}
        >
          Load earlier messages
        </Button>
      )}

      <ol className="flex flex-1 flex-col gap-2" aria-label={`Conversation with ${partner.name}`}>
        {ordered.length === 0 && (
          <li className="text-center text-sm text-muted">You matched! Say hello.</li>
        )}
        {ordered.map((message) => {
          const mine = message.senderId === myId;
          return (
            <li key={message.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                  mine ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-black/5'
                }`}
              >
                {message.body}
              </div>
              {!mine && looksLikeMoneyRequest(message.body) && (
                <MoneyWarning
                  onReport={() => {
                    setReporting({ message, reason: 'asking_for_money' });
                  }}
                />
              )}
              <span className="mt-0.5 flex gap-2 text-[11px] text-muted">
                <time dateTime={message.createdAt}>{time(message.createdAt)}</time>
                {!mine && (
                  <button
                    type="button"
                    className="font-semibold text-danger hover:underline"
                    onClick={() => {
                      setReporting({ message });
                    }}
                  >
                    Report
                  </button>
                )}
                {mine && message.id === lastMine?.id && seen && <span>Seen</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <div ref={bottomRef} />

      {reporting && (
        <ReportForm
          userId={partner.id}
          name={partner.name}
          messageId={reporting.message.id}
          messagePreview={reporting.message.body}
          {...(reporting.reason ? { initialReason: reporting.reason } : {})}
          onDone={setDone}
          onCancel={() => {
            setReporting(null);
          }}
        />
      )}

      {nudge === 'contact' && (
        <Alert tone="info">
          Sharing contact or payment details? Only share with people you trust. You can keep
          chatting here, and never send money to someone you haven&apos;t met.
        </Alert>
      )}
      {nudge === 'money' && (
        <Alert tone="info">
          Asking members for money, payments or bank details is against our{' '}
          <Link to="/guidelines#never_ask_for_money" className="font-semibold underline">
            community guidelines
          </Link>{' '}
          and can get your account restricted.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      {chatRestricted ? (
        <Alert tone="info">
          You can&apos;t send messages right now because of a restriction on your account. You can
          still read this chat.
        </Alert>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="flex items-end gap-2">
          <label htmlFor="chat-draft" className="sr-only">
            Message
          </label>
          <textarea
            id="chat-draft"
            rows={2}
            maxLength={LIMITS.MESSAGE_MAX_LENGTH}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setNudge(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={`Message ${partner.name}`}
            className="min-h-11 flex-1 resize-none rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-brand-600"
          />
          <Button
            type="submit"
            className="w-auto! px-5"
            loading={send.isPending}
            disabled={!draft.trim()}
          >
            {nudge ? 'Send anyway' : 'Send'}
          </Button>
        </form>
      )}

      <SafetyActions userId={partner.id} name={partner.name} onDone={setDone} />
    </div>
  );
}
