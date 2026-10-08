import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

const TONE = {
  error: { box: 'bg-danger-soft text-danger ring-danger/20', icon: 'alert' },
  warning: { box: 'bg-accent-yellow-soft text-primary ring-accent-yellow/60', icon: 'alert' },
  success: { box: 'bg-success-soft text-success ring-success/20', icon: 'check' },
  info: { box: 'bg-brand-50 text-brand-800 ring-brand-200', icon: 'shield' },
} as const satisfies Record<string, { box: string; icon: IconName }>;

/** An inline message. `error` interrupts screen readers; the other tones are polite. */
export function Alert({
  tone,
  title,
  children,
  className,
}: {
  tone: keyof typeof TONE;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex gap-3 rounded-control px-4 py-3 text-small ring-1',
        TONE[tone].box,
        className,
      )}
    >
      <Icon name={TONE[tone].icon} className="mt-0.5 size-4.5" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
