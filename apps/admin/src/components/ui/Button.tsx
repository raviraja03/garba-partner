import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'link';
  loading?: boolean;
}

const VARIANT_CLASS = {
  primary:
    'w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-300',
  secondary:
    'w-full rounded-xl bg-white px-4 py-3 font-semibold text-ink ring-1 ring-black/10 hover:bg-brand-50 disabled:text-muted',
  link: 'font-semibold text-brand-700 underline-offset-4 hover:underline disabled:text-muted disabled:no-underline',
} as const;

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={Boolean(disabled) || loading}
      aria-busy={loading}
      className={`min-h-11 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}
