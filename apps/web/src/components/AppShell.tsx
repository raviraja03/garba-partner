import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { APP_NAME } from '@garba-partner/shared';
import { useAuth } from '../features/auth/auth-context';
import { Button } from './ui/Button';

const MEMBER_NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/events', label: 'Events', end: false },
  { to: '/profile', label: 'My profile', end: true },
] as const;

const VISITOR_NAV = [{ to: '/events', label: 'Events', end: false }] as const;

/** Layout for app pages (mobile-first). Event pages are public, so visitors see it too. */
export function AppShell() {
  const { state, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const authenticated = state.status === 'authenticated';
  const nav = authenticated ? MEMBER_NAV : VISITOR_NAV;

  async function handleSignOut() {
    setSigningOut(true);
    await signOut().catch(() => undefined);
    await navigate('/login', { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-4 sm:px-6">
      <header className="flex items-center justify-between gap-4 border-b border-black/5 pb-4">
        <Link to={authenticated ? '/' : '/events'} className="text-lg font-bold text-brand-700">
          {APP_NAME}
        </Link>
        <nav aria-label="Main" className="flex items-center gap-4 text-sm">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? 'font-semibold text-brand-700' : 'text-muted hover:text-ink'
              }
            >
              {item.label}
            </NavLink>
          ))}
          {authenticated && (
            <Button variant="link" loading={signingOut} onClick={() => void handleSignOut()}>
              Log out
            </Button>
          )}
          {state.status === 'anonymous' && (
            <Link
              to="/login"
              state={{ from: location.pathname }}
              className="font-semibold text-brand-700 hover:underline"
            >
              Log in
            </Link>
          )}
        </nav>
      </header>
      <main className="flex-1 py-6">
        <Outlet />
      </main>
    </div>
  );
}
