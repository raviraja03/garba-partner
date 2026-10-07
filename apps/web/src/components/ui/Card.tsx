import type { HTMLAttributes } from 'react';
import { cx } from './cx';

/** The one card surface: white, soft shadow, hairline, 20px radius. */
export const CARD_CLASS = 'rounded-card bg-card shadow-card ring-1 ring-brand-900/5';

const PADDING = { none: '', sm: 'p-4', md: 'p-5 sm:p-6' } as const;

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'li' | 'aside';
  padding?: keyof typeof PADDING;
  /** Lift on hover: for cards that are links. Respects reduced motion (see theme.css). */
  interactive?: boolean;
}

export function Card({
  as: Tag = 'div',
  padding = 'md',
  interactive = false,
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cx(
        CARD_CLASS,
        PADDING[padding],
        padding === 'none' && 'overflow-hidden',
        interactive &&
          'transition-[box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-raised',
        className,
      )}
      {...rest}
    />
  );
}
