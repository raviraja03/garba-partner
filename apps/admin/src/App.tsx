import { APP_NAME } from '@garba-partner/shared';
import { ApiStatus } from './components/ApiStatus';

/** Admin areas planned for later phases (docs/architecture/application-architecture.md §7). */
const PLANNED_SECTIONS = [
  'Dashboard',
  'Reports',
  'Verifications',
  'Photo review',
  'Users',
  'Events',
  'Cities',
  'Audit log',
] as const;

export function App() {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 bg-ink p-5 text-white md:block">
        <p className="font-bold">{APP_NAME}</p>
        <p className="text-xs text-white/60">Admin console</p>
        <nav aria-label="Admin sections" className="mt-8">
          <ul className="space-y-1 text-sm">
            {PLANNED_SECTIONS.map((section) => (
              <li key={section} className="rounded-md px-3 py-2 text-white/50">
                {section}
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-black/5 bg-white px-6 py-4">
          <h1 className="text-lg font-semibold">Admin console</h1>
          <ApiStatus />
        </header>

        <main className="flex-1 p-6">
          <section className="max-w-xl rounded-card bg-white p-6 shadow-sm ring-1 ring-black/5">
            <h2 className="font-semibold text-brand-700">Foundation ready</h2>
            <p className="mt-2 text-sm text-muted">
              Sign-in, moderation queues and event management arrive in later phases. Access to this
              console will require an admin account with two-factor authentication.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
