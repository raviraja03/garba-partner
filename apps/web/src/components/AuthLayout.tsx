import type { ReactNode } from 'react';
import { APP_TAGLINE } from '@garba-partner/shared';
import { Logo, LogoIcon } from './Logo';
import { Icon, type IconName } from './ui/Icon';

const POINTS: { icon: IconName; text: string }[] = [
  { icon: 'users', text: 'Find a Garba partner who matches your level and dates.' },
  { icon: 'calendar', text: 'Discover Garba events in your city.' },
  { icon: 'shield', text: 'You decide who can message you. Block or report anyone, any time.' },
];

/**
 * Shell for the sign-in screens. Phones and tablets: one column with the logo on top.
 * Desktop (`lg`+): a Deep Purple brand panel beside the form.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        {/* Two soft festive glows; decorative only. */}
        <span
          aria-hidden="true"
          className="absolute -top-24 -right-24 size-80 rounded-full bg-secondary/25 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-32 -left-20 size-96 rounded-full bg-accent-orange/20 blur-3xl"
        />
        <LogoIcon className="relative size-20" />
        <div className="relative">
          <p className="text-display text-white">{APP_TAGLINE}</p>
          <ul className="mt-8 space-y-4">
            {POINTS.map((point) => (
              <li key={point.text} className="flex items-start gap-3 text-white/90">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-accent-yellow">
                  <Icon name={point.icon} />
                </span>
                <span className="pt-1.5">{point.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-small text-white/70">For adults (18+) only.</p>
      </aside>

      <div className="mx-auto flex w-full max-w-md flex-col px-gutter py-8 sm:px-6">
        <header>
          <Logo className="h-12 sm:h-14 lg:hidden" />
        </header>
        <main className="flex flex-1 flex-col justify-center py-10">
          <h1 className="text-h1">{title}</h1>
          <div className="mt-2 text-muted">{subtitle}</div>
          <div className="mt-8">{children}</div>
        </main>
        <footer className="text-caption text-muted">
          18+ only. We never show your phone number to other members.
        </footer>
      </div>
    </div>
  );
}
