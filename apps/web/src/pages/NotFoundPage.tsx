import { Link } from 'react-router';
import { Logo } from '../components/Logo';
import { LinkButton } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-gutter py-10 text-center">
      <Link to="/" className="rounded-control">
        <Logo className="h-12" />
      </Link>
      <p className="mt-10 text-label tracking-widest text-accent-700 uppercase">Error 404</p>
      <h1 className="mt-2 text-h1">Page not found</h1>
      <p className="mt-2 text-muted">
        This page doesn&apos;t exist, or the link is out of date. Let&apos;s get you back to the
        dance floor.
      </p>
      <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <LinkButton to="/" fullWidth>
          Go home
        </LinkButton>
        <LinkButton to="/events" variant="secondary" fullWidth>
          Browse events
        </LinkButton>
      </div>
    </main>
  );
}
