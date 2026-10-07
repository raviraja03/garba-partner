import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../features/auth/auth-context';
import { useUnreadCount } from '../features/chat/hooks';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { Logo } from './Logo';
import { PAGE_GUTTER } from './PageContainer';
import { Avatar } from './ui/Avatar';
import { CountBadge } from './ui/Badge';
import { Button, LinkButton } from './ui/Button';
import { cx } from './ui/cx';
import { Drawer } from './ui/Dialog';
import { Dropdown } from './ui/Dropdown';
import { Icon, type IconName } from './ui/Icon';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end: boolean;
}

/** A signed-in member's main destinations: the desktop row, in this order. */
const MEMBER_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/events', label: 'Events', icon: 'calendar', end: false },
  { to: '/discover', label: 'Discover', icon: 'compass', end: false },
  { to: '/interests', label: 'Interests', icon: 'heart', end: false },
  { to: '/matches', label: 'Matches', icon: 'users', end: false },
  { to: '/chats', label: 'Chats', icon: 'chat', end: false },
];

/** The four destinations on the mobile tab bar (the fifth tab opens the "More" sheet). */
const TAB_PATHS = ['/', '/events', '/discover', '/chats'];
const TAB_NAV = MEMBER_NAV.filter((item) => TAB_PATHS.includes(item.to));

/** Everything else: the account menu on desktop, the "More" sheet on mobile. */
const ACCOUNT_NAV: NavItem[] = [
  { to: '/profile', label: 'My profile', icon: 'user', end: false },
  { to: '/bookings', label: 'My passes', icon: 'ticket', end: false },
  { to: '/safety', label: 'Safety centre', icon: 'shield', end: false },
];
const MORE_NAV: NavItem[] = [
  ...MEMBER_NAV.filter((item) => !TAB_PATHS.includes(item.to)),
  ...ACCOUNT_NAV,
];

/** Visitors can browse events before signing up. */
const VISITOR_NAV: NavItem[] = [{ to: '/events', label: 'Events', icon: 'calendar', end: false }];

/** Unread-message count for "Chats" (active members only; updated live by the socket). */
function useChatsUnread(enabled: boolean): number {
  return useUnreadCount(enabled).data ?? 0;
}

const unreadLabel = (count: number) => `${String(count)} unread messages`;

/**
 * Site navigation (docs/design/design-system.md §7):
 * - a top bar on every screen: logo, notifications, account;
 * - desktop (`lg`+): the destinations sit in the top bar, with an account menu;
 * - mobile and tablet: a bottom tab bar within thumb reach (Home, Events, Discover, Chats)
 *   and a "More" sheet for everything else. Nothing is hidden without a replacement.
 * Visitors only have Events and Log in, so they get the top bar alone.
 * `tabBar={false}` drops the tab bar on a full-screen task (an open conversation).
 */
export function Navbar({ tabBar = true }: { tabBar?: boolean }) {
  const { state, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const authenticated = state.status === 'authenticated';
  // Chats need a finished profile: asking earlier only earns a refusal from the API.
  const chatsEnabled =
    state.status === 'authenticated' &&
    state.user.status === 'active' &&
    state.user.onboardingStatus === 'complete';
  const unreadChats = useChatsUnread(chatsEnabled);
  const displayName = state.status === 'authenticated' ? state.user.displayName : null;
  const moreActive = MORE_NAV.some(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  );

  async function handleSignOut() {
    setSigningOut(true);
    setMoreOpen(false);
    await signOut().catch(() => undefined);
    await navigate('/login', { replace: true });
  }

  const closeMore = () => {
    setMoreOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
        <div
          className={cx('mx-auto flex h-16 max-w-page items-center gap-2 lg:gap-6', PAGE_GUTTER)}
        >
          <Link
            to={authenticated ? '/' : '/events'}
            className="mr-auto flex min-h-11 shrink-0 items-center rounded-lg lg:mr-0"
          >
            <Logo className="h-9 sm:h-10" />
          </Link>

          {/* Desktop destinations. Visitors keep their single link at every width. */}
          <nav
            aria-label="Main"
            className={cx('mr-auto items-stretch gap-1', authenticated ? 'hidden lg:flex' : 'flex')}
          >
            {(authenticated ? MEMBER_NAV : VISITOR_NAV).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx(
                    'relative flex h-16 items-center gap-1.5 px-3 text-small font-semibold transition-colors',
                    // The active page: purple text and a pink bar on the header's bottom edge.
                    'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
                    isActive
                      ? 'text-primary after:bg-accent-500'
                      : 'text-muted after:bg-transparent hover:text-primary',
                  )
                }
              >
                {item.label}
                {item.to === '/chats' && (
                  <CountBadge count={unreadChats} label={unreadLabel(unreadChats)} />
                )}
              </NavLink>
            ))}
          </nav>

          {authenticated && <NotificationBell enabled={authenticated} />}

          {authenticated && (
            <>
              {/* Mobile and tablet: the avatar is a shortcut to the profile. */}
              <Link
                to="/profile"
                aria-label="My profile"
                className="-mr-1 flex size-11 items-center justify-center rounded-full lg:hidden"
              >
                <Avatar name={displayName ?? 'Me'} size="sm" />
              </Link>
              <div className="hidden lg:block">
                <Dropdown
                  label="Account menu"
                  trigger={
                    <>
                      <Avatar name={displayName ?? 'Me'} size="sm" />
                      <span className="max-w-28 truncate">{displayName ?? 'Account'}</span>
                    </>
                  }
                  items={[
                    ...ACCOUNT_NAV.map((item) => ({
                      key: item.to,
                      label: item.label,
                      icon: item.icon,
                      to: item.to,
                    })),
                    {
                      key: 'logout',
                      label: 'Log out',
                      icon: 'logout' as const,
                      onSelect: () => void handleSignOut(),
                    },
                  ]}
                />
              </div>
            </>
          )}

          {state.status === 'anonymous' && (
            <LinkButton to="/login" state={{ from: location.pathname }} size="sm">
              Log in
            </LinkButton>
          )}
        </div>
      </header>

      {authenticated && tabBar && (
        <>
          {/* Mobile and tablet: bottom tab bar, within thumb reach. */}
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgb(45_27_105/0.18)] backdrop-blur-md lg:hidden"
          >
            <ul className="mx-auto grid max-w-lg grid-cols-5">
              {TAB_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end} className="group block">
                    {({ isActive }) => (
                      <Tab
                        icon={item.icon}
                        label={item.label}
                        active={isActive}
                        badge={
                          item.to === '/chats' ? (
                            <CountBadge count={unreadChats} label={unreadLabel(unreadChats)} />
                          ) : null
                        }
                      />
                    )}
                  </NavLink>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={moreOpen}
                  onClick={() => {
                    setMoreOpen(true);
                  }}
                  className="group block w-full"
                >
                  <Tab icon="menu" label="More" active={moreActive || moreOpen} />
                </button>
              </li>
            </ul>
          </nav>

          <Drawer open={moreOpen} onClose={closeMore} title="More" side="bottom">
            <div className="flex items-center gap-3 rounded-control bg-brand-50 p-3">
              <Avatar name={displayName ?? 'Me'} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-h3">{displayName ?? 'Your account'}</p>
                <Link
                  to="/profile"
                  onClick={closeMore}
                  className="-my-2 inline-flex min-h-11 items-center text-small font-semibold text-brand-700 underline-offset-4 hover:underline"
                >
                  View profile
                </Link>
              </div>
            </div>
            <nav aria-label="More" className="-mx-2 mt-3 flex flex-col gap-1">
              {MORE_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={closeMore}
                  className={({ isActive }) =>
                    cx(
                      'flex min-h-13 items-center gap-3 rounded-control px-3 text-body font-semibold transition-colors',
                      isActive ? 'bg-brand-600 text-white' : 'text-ink hover:bg-brand-50',
                    )
                  }
                >
                  <Icon name={item.icon} className="size-5.5" />
                  <span className="flex-1">{item.label}</span>
                  <Icon name="chevron-right" className="size-4 opacity-50" />
                </NavLink>
              ))}
            </nav>
            <div className="mt-4 border-t border-line pt-4">
              <Button variant="secondary" loading={signingOut} onClick={() => void handleSignOut()}>
                <Icon name="logout" />
                Log out
              </Button>
            </div>
          </Drawer>
        </>
      )}
    </>
  );
}

/** One tab of the bottom bar: icon in a pill (filled when active) above a short label. */
function Tab({
  icon,
  label,
  active,
  badge,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  badge?: ReactNode;
}) {
  return (
    <span
      className={cx(
        'flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[0.75rem] leading-none transition-colors',
        active ? 'font-bold text-primary' : 'font-semibold text-muted group-hover:text-primary',
      )}
    >
      <span
        className={cx(
          'relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200',
          active ? 'bg-brand-100' : 'group-hover:bg-brand-50',
        )}
      >
        <Icon name={icon} className="size-5.5" />
        {badge && <span className="absolute -top-1 right-0">{badge}</span>}
      </span>
      {label}
    </span>
  );
}
