import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

/**
 * Shown when a list has nothing in it, or a page failed to load. Say what happened in plain
 * words and offer the next step as `action` (a Button or LinkButton). Never show a raw API
 * error here.
 */
export function EmptyState({
  icon = 'compass',
  tone = 'default',
  title,
  children,
  action,
  className,
}: {
  icon?: IconName;
  tone?: 'default' | 'error';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cx(
        'flex flex-col items-center rounded-card border border-dashed border-brand-200 bg-card/60 px-6 py-10 text-center',
        className,
      )}
    >
      <span
        className={cx(
          'flex size-14 items-center justify-center rounded-full',
          tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-brand-50 text-brand-500',
        )}
      >
        <Icon name={tone === 'error' ? 'alert' : icon} className="size-7" />
      </span>
      <h2 className="mt-4 text-h3 text-ink">{title}</h2>
      {children && <div className="mt-1 max-w-sm text-small text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
