import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { APP_NAME, type AdminPermission } from '@garba-partner/shared';
import { ApiStatus } from '../components/ApiStatus';
import { Button } from '../components/ui/Button';
import { useAdminAuth } from '../features/auth/auth-context';

/** Planned sections; each is shown only to roles holding its permission (UX only). */
const SECTIONS: readonly { label: string; permission: AdminPermission; path?: string }[] = [
  { label: 'Dashboard', permission: 'dashboard:view', path: '/' },
  { label: 'Reports', permission: 'reports:manage' },
  { label: 'Verifications', permission: 'verifications:review' },
  { label: 'Photo review', permission: 'photos:review' },
  { label: 'Users', permission: 'users:view' },
  { label: 'Events', permission: 'events:view' },
  { label: 'Cities', permission: 'locations:manage' },
  { label: 'Audit log', permission: 'audit:view' },
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
        <p className="font-bold">{APP_NAME}</p>
        <p className="text-xs text-white/60">Admin console</p>
        <nav aria-label="Admin sections" className="mt-8">
          <ul className="space-y-1 text-sm">
            {visibleSections.map((section) => (
              <li key={section.label}>
                {section.path ? (
                  <NavLink
                    to={section.path}
                    end
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

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-black/5 bg-white px-6 py-4">
          <div>
            <p className="text-sm font-semibold">{admin.name}</p>
            <p className="text-xs text-muted">
              {admin.email} · {admin.role.replace('_', ' ')}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ApiStatus />
            <Button
              variant="link"
              loading={signingOut}
              onClick={() => {
                void handleSignOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
