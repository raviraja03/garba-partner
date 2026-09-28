import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { APP_NAME } from '@garba-partner/shared';
import { useAuth } from '../features/auth/auth-context';
import { Button } from './ui/Button';

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/profile', label: 'My profile' },
] as const;

/** Layout for signed-in pages (mobile-first). */
export function AppShell() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut().catch(() => undefined);
    await navigate('/login', { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-4 sm:px-6">
      <header className="flex items-center justify-between gap-4 border-b border-black/5 pb-4">
        <span className="text-lg font-bold text-brand-700">{APP_NAME}</span>
        <nav aria-label="Main" className="flex items-center gap-4 text-sm">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                isActive ? 'font-semibold text-brand-700' : 'text-muted hover:text-ink'
              }
            >
              {item.label}
            </NavLink>
          ))}
          <Button variant="link" loading={signingOut} onClick={() => void handleSignOut()}>
            Log out
          </Button>
        </nav>
      </header>
      <main className="flex-1 py-6">
        <Outlet />
      </main>
    </div>
  );
}
