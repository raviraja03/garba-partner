import { LogoIcon } from './Logo';
import { Spinner } from './ui/Spinner';

/** Shown while the session or a whole page is loading (lists use skeletons instead). */
export function FullPageSpinner() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 text-brand-500"
      role="status"
      aria-live="polite"
    >
      <LogoIcon decorative className="size-14 motion-safe:animate-pulse" />
      <Spinner className="size-6" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
