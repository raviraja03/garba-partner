import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

/**
 * Tones:
 * - `neutral`  metadata (level, city)
 * - `brand`    purple tint: reasons, interests, selected filters
 * - `pink`     social signals ("Interested in you", unread)
 * - `orange` / `yellow`  festive highlights (event dates, "Few passes left"); purple text
 * - `success`  a completed check, incl. verification (see VerifiedBadge for the wording rules)
 * - `danger`   blocked, cancelled, failed
 */
const TONE = {
  neutral: 'bg-brand-900/5 text-ink',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
  pink: 'bg-accent-50 text-accent-700',
  orange: 'bg-accent-orange-soft text-primary',
  yellow: 'bg-accent-yellow-soft text-primary',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
} as const;

/** Solid counter bubble for unread counts (nav, chats). */
export function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={label}
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent-600 px-1.5 text-[0.75rem] leading-5 font-bold text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Badge({
  tone = 'neutral',
  icon,
  title,
  children,
  className,
}: {
  tone?: keyof typeof TONE;
  icon?: IconName;
  /** Longer explanation, shown as a tooltip. Never the only place a meaning lives. */
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption leading-none font-semibold whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} className="size-3.5" />}
      {children}
    </span>
  );
}
