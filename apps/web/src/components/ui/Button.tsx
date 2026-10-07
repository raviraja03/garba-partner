import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';
import { buttonClass, type ButtonSize, type ButtonVariant } from './button-styles';
import { Spinner } from './Spinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Stretch to the container width. Defaults to `true` for the solid variants, as the forms
   * written before the design system expect; pass `fullWidth={false}` for an inline button.
   */
  fullWidth?: boolean;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = true,
  loading = false,
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={Boolean(disabled) || loading}
      aria-busy={loading}
      className={buttonClass({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner className="size-4" />
          Please wait…
        </>
      ) : (
        children
      )}
    </button>
  );
}

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/** A navigation link that looks like a button (use instead of styling a `<Link>` by hand). */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  ...rest
}: LinkButtonProps) {
  return <Link className={buttonClass({ variant, size, fullWidth, className })} {...rest} />;
}
