import { useAdminAuth } from '../features/auth/auth-context';

export function DashboardPage() {
  const { state } = useAdminAuth();
  if (state.status !== 'authenticated') return null;

  return (
    <section className="max-w-xl rounded-card bg-white p-6 shadow-sm ring-1 ring-black/5">
      <h1 className="text-lg font-semibold text-brand-700">Dashboard</h1>
      <p className="mt-2 text-sm text-muted">
        Signed in as <strong>{state.admin.name}</strong>. Moderation queues, events and user
        management arrive in later phases.
      </p>
      <h2 className="mt-4 text-sm font-semibold">Your permissions</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {state.admin.permissions.map((permission) => (
          <li
            key={permission}
            className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-900"
          >
            {permission}
          </li>
        ))}
      </ul>
    </section>
  );
}
