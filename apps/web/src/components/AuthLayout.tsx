import type { ReactNode } from 'react';
import { APP_NAME } from '@garba-partner/shared';

/** Shell for the login screens (mobile-first, single column). */
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
      <header>
        <span className="text-lg font-bold text-brand-700">{APP_NAME}</span>
      </header>
      <main className="flex flex-1 flex-col justify-center py-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-balance">{title}</h1>
        <div className="mt-2 text-muted">{subtitle}</div>
        <div className="mt-8">{children}</div>
      </main>
      <footer className="text-xs text-muted">
        18+ only. We never show your phone number to other members.
      </footer>
    </div>
  );
}
