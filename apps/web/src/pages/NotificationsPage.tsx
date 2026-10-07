import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CONFIGURABLE_NOTIFICATION_TYPES, type NotificationDto } from '@garba-partner/shared';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Avatar } from '../components/ui/Avatar';
import { Button, LinkButton } from '../components/ui/Button';
import { Card, CARD_CLASS } from '../components/ui/Card';
import { cx } from '../components/ui/cx';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Choice } from '../components/ui/Input';
import { LoadingRegion, SkeletonRow } from '../components/ui/Skeleton';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationPreferences,
  useNotifications,
  useUpdateNotificationPreferences,
} from '../features/notifications/hooks';
import { notificationText, PREFERENCE_LABELS } from '../features/notifications/notification-text';

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

function Preferences() {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  if (!preferences.data) return null;
  const values = preferences.data;
  return (
    <Card as="section" aria-labelledby="notification-settings" className="animate-fade-in">
      <h2 id="notification-settings" className="text-h3">
        Notify me when…
      </h2>
      <div className="mt-1">
        {CONFIGURABLE_NOTIFICATION_TYPES.map((type) => (
          <Choice
            key={type}
            label={PREFERENCE_LABELS[type]}
            checked={values[type]}
            disabled={update.isPending}
            onChange={(e) => {
              update.mutate({ [type]: e.target.checked });
            }}
          />
        ))}
      </div>
      <p className="mt-2 text-caption text-muted">
        Safety notices about your account are always shown. Notifications never include message text
        or anyone&apos;s contact details.
      </p>
      {update.isError && (
        <Alert tone="error" className="mt-3">
          {update.error.message}
        </Alert>
      )}
    </Card>
  );
}

/** Notification list: newest first, unread highlighted, mark one (by opening) or all as read. */
export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const list = useNotifications(unreadOnly);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const hasUnread = items.some((n) => !n.readAt);

  async function open(n: NotificationDto) {
    if (!n.readAt) await markRead.mutateAsync(n.id).catch(() => undefined);
    if (n.link) await navigate(n.link);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Notifications" />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={unreadOnly ? 'primary' : 'secondary'}
          size="sm"
          fullWidth={false}
          aria-pressed={unreadOnly}
          onClick={() => {
            setUnreadOnly((value) => !value);
          }}
        >
          Unread only
        </Button>
        <Button
          variant="secondary"
          size="sm"
          fullWidth={false}
          aria-expanded={showSettings}
          onClick={() => {
            setShowSettings((value) => !value);
          }}
        >
          <Icon name="bell" className="size-4" />
          Settings
        </Button>
        <Button
          variant="ghost"
          size="sm"
          fullWidth={false}
          className="ml-auto"
          disabled={!hasUnread}
          loading={markAll.isPending}
          onClick={() => {
            markAll.mutate();
          }}
        >
          <Icon name="check" className="size-4" />
          Mark all as read
        </Button>
      </div>

      {showSettings && <Preferences />}

      {list.isPending && (
        <LoadingRegion label="Loading notifications…" className="space-y-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </LoadingRegion>
      )}
      {list.isError && (
        <EmptyState
          tone="error"
          title="We couldn't load your notifications"
          action={
            <Button variant="secondary" fullWidth={false} onClick={() => void list.refetch()}>
              Try again
            </Button>
          }
        >
          {list.error.message}
        </EmptyState>
      )}
      {list.isSuccess && items.length === 0 && (
        <EmptyState
          icon="bell"
          title={unreadOnly ? 'You’re all caught up' : 'No notifications yet'}
          action={
            unreadOnly ? (
              <Button
                variant="secondary"
                fullWidth={false}
                onClick={() => {
                  setUnreadOnly(false);
                }}
              >
                Show all notifications
              </Button>
            ) : (
              <LinkButton to="/discover">Find a partner</LinkButton>
            )
          }
        >
          {unreadOnly
            ? 'There is nothing new to read.'
            : 'Interests, matches and messages will show up here.'}
        </EmptyState>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void open(n)}
                className={cx(
                  CARD_CLASS,
                  'flex min-h-16 w-full items-center gap-3 p-3 text-left transition-shadow duration-200 ease-soft hover:shadow-raised',
                  !n.readAt && 'bg-brand-50 ring-brand-200',
                )}
              >
                {n.actor ? (
                  <Avatar name={n.actor.name} src={n.actor.thumbnailUrl} />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600"
                  >
                    <Icon name="bell" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-small text-ink', !n.readAt && 'font-semibold')}>
                    {notificationText(n)}
                  </span>
                  <time dateTime={n.occurredAt} className="text-caption text-muted">
                    {when(n.occurredAt)}
                  </time>
                </span>
                {!n.readAt && (
                  <>
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full bg-accent-500"
                    />
                    <span className="sr-only">Unread</span>
                  </>
                )}
              </button>
            </li>
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
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
