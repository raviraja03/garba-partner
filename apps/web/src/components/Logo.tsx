import { APP_NAME } from '@garba-partner/shared';
import { cx } from './ui/cx';

/*
 * The finalized GarbaMates artwork, used as provided (public/brand/). Never recolour, crop or
 * rebuild it in CSS.
 *
 * - `Logo`     the full logo (dancers + wordmark + tagline). Light backgrounds only: the
 *              wordmark is Deep Purple and disappears on purple.
 * - `LogoIcon` the app icon (dancers on a purple tile). Works on any background.
 */

// Intrinsic sizes of the exported files: reserving them prevents layout shift.
const LOGO = { src: '/brand/logo.webp', width: 723, height: 192 };
const ICON = { src: '/brand/icon.webp', width: 192, height: 192 };

export function Logo({ className = 'h-10' }: { className?: string }) {
  return (
    <img
      src={LOGO.src}
      width={LOGO.width}
      height={LOGO.height}
      alt={APP_NAME}
      decoding="async"
      className={cx('w-auto', className)}
    />
  );
}

export function LogoIcon({
  className = 'size-10',
  decorative = false,
}: {
  className?: string;
  /** True when the name is printed next to the icon. */
  decorative?: boolean;
}) {
  return (
    <img
      src={ICON.src}
      width={ICON.width}
      height={ICON.height}
      alt={decorative ? '' : APP_NAME}
      decoding="async"
      className={className}
    />
  );
}
