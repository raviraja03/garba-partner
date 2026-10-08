import type { ReactNode } from 'react';
import { CARD_CLASS } from './Card';
import { cx } from './cx';

/** A grey placeholder block. Size it with classes: `<Skeleton className="h-4 w-32" />`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('block animate-pulse rounded-lg bg-brand-900/8', className)}
    />
  );
}

/**
 * Wrap a group of skeletons: announces "Loading" once to screen readers instead of leaving
 * them with silence.
 */
export function LoadingRegion({
  label = 'Loading…',
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Placeholder for an image-topped card (event or partner card). */
export function SkeletonCard({ aspect = 'aspect-video' }: { aspect?: string }) {
  return (
    <div className={cx(CARD_CLASS, 'overflow-hidden')}>
      <Skeleton className={cx('w-full rounded-none', aspect)} />
      <div className="space-y-3 p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

/** Placeholder for an avatar + two lines row (matches, chats, interests). */
export function SkeletonRow() {
  return (
    <div className={cx(CARD_CLASS, 'flex items-center gap-3 p-4')}>
      <Skeleton className="size-14 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
