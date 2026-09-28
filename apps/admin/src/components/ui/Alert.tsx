import type { ReactNode } from 'react';

const TONE_CLASS = {
  error: 'bg-red-50 text-red-800 ring-red-200',
  info: 'bg-brand-50 text-brand-900 ring-brand-200',
} as const;

export function Alert({ tone, children }: { tone: keyof typeof TONE_CLASS; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl px-4 py-3 text-sm ring-1 ${TONE_CLASS[tone]}`}
    >
      {children}
    </p>
  );
}
