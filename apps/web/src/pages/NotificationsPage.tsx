import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CONFIGURABLE_NOTIFICATION_TYPES, type NotificationDto } from '@garba-partner/shared';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FullPageSpinner } from '../components/FullPageSpinner';
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
    <section
      aria-labelledby="notification-settings"
      className="space-y-2 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5"
    >
      <h2 id="notification-settings" className="font-semibold">
        Notify me when…
      </h2>
      {CONFIGURABLE_NOTIFICATION_TYPES.map((type) => (
        <label key={type} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values[type]}
            disabled={update.isPending}
            onChange={(e) => {
              update.mutate({ [type]: e.target.checked });
            }}
          />
          {PREFERENCE_LABELS[type]}
        </label>
      ))}
      <p className="text-xs text-muted">
        Safety notices about your account are always shown. Notifications never include message text
        or anyone&apos;s contact details.
      </p>
      {update.isError && <Alert tone="error">{update.error.message}</Alert>}
    </section>
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

  async function open(n: NotificationDto) {
    if (!n.readAt) await markRead.mutateAsync(n.id).catch(() => undefined);
    if (n.link) await navigate(n.link);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <div className="flex flex-wrap gap-3 text-sm">
          <Button
            variant="link"
            onClick={() => {
              setUnreadOnly((value) => !value);
            }}
          >
            {unreadOnly ? 'Show all' : 'Unread only'}
          </Button>
          <Button
            variant="link"
            loading={markAll.isPending}
            onClick={() => {
              markAll.mutate();
            }}
          >
            Mark all as read
          </Button>
          <Button
            variant="link"
            onClick={() => {
              setShowSettings((value) => !value);
            }}
          >
            Settings
          </Button>
        </div>
      </header>

      {showSettings && <Preferences />}
      {list.isPending && <FullPageSpinner />}
      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      {!list.isPending && items.length === 0 && (
        <Alert tone="info">
          {unreadOnly ? 'You’re all caught up.' : 'No notifications yet.'}{' '}
          <Link to="/discover" className="font-semibold underline">
            Find a partner
          </Link>
        </Alert>
      )}

      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => void open(n)}
              className={`flex w-full items-center gap-3 rounded-card p-3 text-left shadow-sm ring-1 ring-black/5 ${
                n.readAt ? 'bg-white' : 'bg-brand-50'
              }`}
            >
              {n.actor?.thumbnailUrl ? (
                <img
                  src={n.actor.thumbnailUrl}
                  alt=""
                  className="size-10 rounded-full object-cover"
                />
              ) : (
                <span className="size-10 shrink-0 rounded-full bg-brand-100" aria-hidden="true" />
              )}
              <span className="flex-1">
                <span className={`block text-sm ${n.readAt ? '' : 'font-semibold'}`}>
                  {notificationText(n)}
                </span>
                <time dateTime={n.occurredAt} className="text-xs text-muted">
                  {when(n.occurredAt)}
                </time>
              </span>
              {!n.readAt && <span className="sr-only">Unread</span>}
            </button>
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <Button
          variant="secondary"
          className="w-auto! px-6"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
