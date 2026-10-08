import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { APP_NAME, type AdminPermission } from '@garba-partner/shared';
import { ApiStatus } from '../components/ApiStatus';
import { Button } from '../components/ui/Button';
import { useAdminAuth } from '../features/auth/auth-context';

/** Planned sections; each is shown only to roles holding its permission (UX only). */
const SECTIONS: readonly { label: string; permission: AdminPermission; path?: string }[] = [
  { label: 'Dashboard', permission: 'dashboard:view', path: '/' },
  { label: 'Notifications', permission: 'dashboard:view', path: '/notifications' },
  { label: 'Reports', permission: 'reports:manage', path: '/reports' },
  { label: 'Safety logs', permission: 'safety_logs:view', path: '/safety-logs' },
  { label: 'Verifications', permission: 'verifications:review' },
  { label: 'Photo review', permission: 'photos:review' },
  { label: 'Users', permission: 'users:view', path: '/users' },
  { label: 'Events', permission: 'events:view', path: '/events' },
  { label: 'Organizers', permission: 'events:view', path: '/organizers' },
  { label: 'Payments', permission: 'payments:view', path: '/payments' },
  { label: 'Cities', permission: 'locations:manage' },
  { label: 'Audit log', permission: 'audit:view', path: '/audit-logs' },
  { label: 'Admins', permission: 'admins:manage' },
];

export function AdminLayout() {
  const { state, signOut } = useAdminAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  if (state.status !== 'authenticated') return null;
  const { admin } = state;
  const visibleSections = SECTIONS.filter((section) =>
    admin.permissions.includes(section.permission),
  );

  async function handleSignOut() {
    setSigningOut(true);
    await signOut().catch(() => undefined);
    await navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 bg-ink p-5 text-white md:block">
        <div className="flex items-center gap-3">
          <img src="/brand/icon.webp" width={192} height={192} alt="" className="size-10" />
          <div>
            <p className="font-bold">{APP_NAME}</p>
            <p className="text-xs text-white/60">Admin console</p>
          </div>
        </div>
        <nav aria-label="Admin sections" className="mt-8">
          <ul className="space-y-1 text-sm">
            {visibleSections.map((section) => (
              <li key={section.label}>
                {section.path ? (
                  <NavLink
                    to={section.path}
                    end={section.path === '/'}
                    className={({ isActive }) =>
                      `block rounded-md px-3 py-2 ${isActive ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5'}`
                    }
                  >
                    {section.label}
                  </NavLink>
                ) : (
                  <span className="block rounded-md px-3 py-2 text-white/40" title="Coming soon">
                    {section.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-black/5 bg-white px-4 py-3 md:px-6 md:py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{admin.name}</p>
            <p className="truncate text-xs text-muted">
              {admin.email} · {admin.role.replace('_', ' ')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 md:gap-4">
            <ApiStatus />
            <Button
              variant="link"
              className="whitespace-nowrap"
              loading={signingOut}
              onClick={() => {
                void handleSignOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </header>
        {/* Phones: the sidebar is hidden, so the sections become a strip that scrolls sideways. */}
        <nav aria-label="Admin sections" className="overflow-x-auto bg-ink md:hidden">
          <ul className="flex w-max gap-1 px-3 py-2 text-sm">
            {visibleSections
              .filter((section) => section.path)
              .map((section) => (
                <li key={section.label}>
                  <NavLink
                    to={section.path ?? '/'}
                    end={section.path === '/'}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center rounded-md px-3 whitespace-nowrap ${isActive ? 'bg-white/15 font-semibold text-white' : 'text-white/80'}`
                    }
                  >
                    {section.label}
                  </NavLink>
                </li>
              ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
