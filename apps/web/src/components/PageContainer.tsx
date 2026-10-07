import type { ReactNode } from 'react';
import { cx } from './ui/cx';

/**
 * The page column. Every page sits in one of two widths, centred, with the same gutters
 * (16px on phones, 24px from `sm`, 32px from `lg`) so content never touches the screen edge:
 *
 * - `wide`    1152px (`max-w-page`): lists and grids, which gain columns on larger screens;
 * - `content` 768px: forms, conversations, profiles and reading text, which get hard to
 *             read when they stretch.
 */
export type PageWidth = 'wide' | 'content';

export const PAGE_GUTTER = 'px-gutter sm:px-6 lg:px-8';

const WIDTH: Record<PageWidth, string> = { wide: 'max-w-page', content: 'max-w-3xl' };

export function PageContainer({
  width = 'content',
  as: Tag = 'div',
  id,
  className,
  children,
}: {
  width?: PageWidth;
  as?: 'div' | 'main';
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag id={id} className={cx('mx-auto w-full', WIDTH[width], PAGE_GUTTER, className)}>
      {children}
    </Tag>
  );
}
