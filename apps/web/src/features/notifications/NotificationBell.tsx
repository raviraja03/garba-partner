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
        `relative inline-flex size-11 items-center justify-center rounded-full transition-colors hover:bg-brand-50 ${isActive ? 'bg-brand-50 text-brand-700' : 'text-brand-700'}`
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
        className="size-5.5"
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span className="absolute top-0.5 right-0 min-w-5 rounded-full bg-accent-600 px-1 text-center text-[0.75rem] leading-5 font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </NavLink>
  );
}
