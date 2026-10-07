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
import { Avatar } from '../components/ui/Avatar';
import { Button, LinkButton } from '../components/ui/Button';
import { CARD_CLASS } from '../components/ui/Card';
import { cx } from '../components/ui/cx';
import { Modal } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { CONTROL_CLASS } from '../components/ui/field-utils';
import { Icon } from '../components/ui/Icon';
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
    <EmptyState
      icon="chat"
      title={message}
      action={<LinkButton to="/chats">Back to chats</LinkButton>}
    >
      <h1 className="sr-only">Chat not available</h1>
    </EmptyState>
  );
}

/*
 * The conversation fills the screen under the site header. On phones (and phones held sideways)
 * it runs edge to edge like a messaging app: the tab bar and footer are hidden here (see
 * AppShell) and the panel pulls out of the page's padding. From `md` it is a card again. The
 * message list scrolls inside it; the composer stays pinned.
 */
const PANEL_HEIGHT =
  'h-[calc(100dvh-4rem-1px)] md:h-[calc(100dvh-8rem-1px)] lg:h-[calc(100dvh-9rem)]';
const PANEL_EDGE_TO_EDGE =
  'max-md:-mx-gutter max-md:-mt-6 max-md:rounded-none max-md:shadow-none max-md:ring-0 sm:max-md:-mx-6 sm:max-md:-mt-8';

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

  // Keep the newest message in view. `shown` re-runs this once the conversation is on screen:
  // the messages can arrive before the chat details, when there is nothing to scroll yet.
  const shown = chat.data !== undefined && !messages.isPending;
  useEffect(() => {
    if (shown) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [newest?.id, shown]);

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
    <div className="space-y-4">
      <section
        aria-label={`Chat with ${partner.name}`}
        className={cx(
          CARD_CLASS,
          PANEL_HEIGHT,
          PANEL_EDGE_TO_EDGE,
          'flex min-h-56 flex-col overflow-hidden',
        )}
      >
        <header className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-2">
          <Link
            to="/chats"
            aria-label="Back to chats"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-brand-700 transition-colors hover:bg-brand-50"
          >
            <Icon name="arrow-left" />
          </Link>
          <Link
            to={`/partners/${partner.id}`}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control pr-2"
          >
            <Avatar name={partner.name} src={partner.image?.thumbnailUrl} />
            <div className="min-w-0">
              <h1 className="truncate text-h3">{partner.name}</h1>
              <p className="text-caption text-muted">View profile</p>
            </div>
          </Link>
          {!connected && (
            <span className="shrink-0 pr-2 text-caption text-muted" role="status">
              Reconnecting…
            </span>
          )}
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
          <p className="mx-auto flex max-w-md items-start gap-2 rounded-control bg-accent-yellow-soft px-3 py-2 text-caption text-primary">
            <Icon name="shield" className="mt-0.5 size-4" />
            Meet at the event or another busy public place. Tell a friend your plans. Never send
            money or share OTPs.
          </p>

          {messages.hasNextPage && (
            <Button
              variant="link"
              className="self-center"
              loading={messages.isFetchingNextPage}
              onClick={() => void messages.fetchNextPage()}
            >
              Load earlier messages
            </Button>
          )}

          <ol className="flex flex-col gap-2.5" aria-label={`Conversation with ${partner.name}`}>
            {ordered.length === 0 && (
              <li className="py-10 text-center text-muted">You matched! Say hello.</li>
            )}
            {ordered.map((message) => {
              const mine = message.senderId === myId;
              return (
                <li
                  key={message.id}
                  className={cx('flex flex-col', mine ? 'items-end' : 'items-start')}
                >
                  <div
                    className={cx(
                      'max-w-[82%] rounded-2xl px-3.5 py-2 text-body break-words whitespace-pre-wrap sm:max-w-[70%]',
                      mine
                        ? 'rounded-br-md bg-brand-600 text-white'
                        : 'rounded-bl-md bg-brand-50 text-ink',
                    )}
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
                  <span className="mt-1 flex items-center gap-2 px-1 text-caption text-muted">
                    <time dateTime={message.createdAt}>{time(message.createdAt)}</time>
                    {!mine && (
                      <button
                        type="button"
                        aria-label="Report this message"
                        // ::after widens the tap area without making every message taller.
                        className="relative font-semibold text-danger underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-3.5 hover:underline"
                        onClick={() => {
                          setReporting({ message });
                        }}
                      >
                        Report
                      </button>
                    )}
                    {mine && message.id === lastMine?.id && seen && (
                      <span className="flex items-center gap-0.5 font-semibold text-success">
                        <Icon name="check" className="size-3.5" />
                        Seen
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 space-y-2 border-t border-line bg-card p-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {nudge === 'contact' && (
            <Alert tone="warning">
              Sharing contact or payment details? Only share with people you trust. You can keep
              chatting here, and never send money to someone you haven&apos;t met.
            </Alert>
          )}
          {nudge === 'money' && (
            <Alert tone="warning">
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
              You can&apos;t send messages right now because of a restriction on your account. You
              can still read this chat.
            </Alert>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="flex items-end gap-2">
              <label htmlFor="chat-draft" className="sr-only">
                Message
              </label>
              <textarea
                id="chat-draft"
                rows={1}
                enterKeyHint="send"
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
                className={`${CONTROL_CLASS} field-sizing-content max-h-32 min-h-12 flex-1 resize-none rounded-3xl`}
              />
              <Button
                type="submit"
                fullWidth={false}
                className="min-h-12 shrink-0 rounded-full!"
                loading={send.isPending}
                disabled={!draft.trim()}
              >
                {nudge ? 'Send anyway' : 'Send'}
              </Button>
            </form>
          )}
        </div>
      </section>

      <SafetyActions userId={partner.id} name={partner.name} onDone={setDone} />

      <Modal
        open={reporting !== null}
        onClose={() => {
          setReporting(null);
        }}
        title="Report a message"
        hideTitle
      >
        {reporting && (
          <ReportForm
            plain
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
      </Modal>
    </div>
  );
}
