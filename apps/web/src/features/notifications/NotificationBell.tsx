import { NavLink } from 'react-router';
import { useNotificationUnread } from './hooks';

/** Bell icon with the unread count, linking to the notification list. */
export function NotificationBell({ enabled }: { enabled: boolean }) {
  const unread = useNotificationUnread(enabled);
  const count = unread.data ?? 0;
  const label = count > 0 ? `Notifications, ${String(count)} unread` : 'Notifications';
  return (
    <NavLink
      to="/notifications"
      aria-label={label}
      title={label}
      className={({ isActive }) =>
        `relative inline-flex items-center ${isActive ? 'text-brand-700' : 'text-muted hover:text-ink'}`
      }
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1.5 -right-2 rounded-full bg-brand-600 px-1.5 text-[10px] leading-4 font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </NavLink>
  );
}
