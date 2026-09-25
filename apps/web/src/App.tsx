import { APP_NAME } from '@garba-partner/shared';
import { ApiStatus } from './components/ApiStatus';

const PRINCIPLES = [
  {
    title: 'Consent first',
    body: 'Nobody can message you unless you accept their interest.',
  },
  {
    title: 'Private by default',
    body: 'Your phone number and exact location are never shown to other members.',
  },
  {
    title: 'Adults only',
    body: 'Garba Partner is for people aged 18 and over.',
  },
] as const;

export function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <span className="text-lg font-bold text-brand-700">{APP_NAME}</span>
        <ApiStatus />
      </header>

      <main className="flex flex-1 flex-col justify-center py-12">
        <p className="text-sm font-semibold tracking-wide text-accent-600 uppercase">Coming soon</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
          Find your Garba partner, safely.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Discover Garba events in your city and connect with people who are looking for a dance
          partner at the same event.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {PRINCIPLES.map((principle) => (
            <li
              key={principle.title}
              className="rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5"
            >
              <h2 className="font-semibold text-brand-700">{principle.title}</h2>
              <p className="mt-1 text-sm text-muted">{principle.body}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="text-xs text-muted">
        © {new Date().getFullYear()} {APP_NAME}. 18+ only.
      </footer>
    </div>
  );
}
