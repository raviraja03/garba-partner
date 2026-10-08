import { cx } from './cx';

/**
 * Button variants (docs/design/design-system.md):
 * - `primary`   Deep Purple. The default action on a screen or in a form.
 * - `cta`       Garba Pink. The ONE headline action of a page ("Find a partner", "Buy pass").
 *               Always large bold text: white on pink only passes contrast at that size.
 * - `secondary` White with a purple outline. The alternative next to a primary button.
 * - `ghost`     No background. Low-emphasis actions in toolbars and cards.
 * - `danger`    Destructive actions (block, unmatch, delete).
 * - `link`      Looks like a text link; for inline actions.
 */
export type ButtonVariant = 'primary' | 'cta' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 text-center transition-[background-color,box-shadow,color,transform] duration-150 ease-soft disabled:cursor-not-allowed';

// No font weight here: each variant sets its own, so the CTA's bold is never overridden.
const SOLID = 'rounded-control shadow-card active:scale-[0.98] disabled:shadow-none';

const VARIANT: Record<ButtonVariant, string> = {
  primary: cx(
    SOLID,
    'bg-brand-600 font-semibold text-white hover:bg-brand-700 disabled:bg-brand-300 disabled:active:scale-100',
  ),
  cta: cx(
    SOLID,
    'bg-accent-500 font-bold text-white hover:bg-accent-600 disabled:bg-accent-200 disabled:active:scale-100',
  ),
  secondary: cx(
    SOLID,
    'bg-card font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50 hover:ring-brand-300 disabled:text-muted disabled:ring-line',
  ),
  ghost:
    'rounded-control font-semibold text-brand-700 hover:bg-brand-50 active:scale-[0.98] disabled:text-muted',
  danger: cx(SOLID, 'bg-danger font-semibold text-white hover:brightness-90 disabled:opacity-50'),
  link: 'font-semibold text-brand-700 underline-offset-4 hover:underline disabled:text-muted disabled:no-underline',
};

/** Every size keeps a 44px minimum touch target. */
const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3.5 py-2 text-small',
  md: 'min-h-11 px-5 py-3 text-button',
  lg: 'min-h-13 px-6 py-3.5 text-[1.1875rem] leading-tight',
};

export function buttonClass({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string | undefined;
} = {}): string {
  // The pink CTA only exists at the large size (see the contrast note above).
  const effectiveSize = variant === 'cta' ? 'lg' : size;
  return cx(
    BASE,
    VARIANT[variant],
    variant === 'link' ? 'min-h-11' : SIZE[effectiveSize],
    fullWidth && variant !== 'link' && 'w-full',
    className,
  );
}
