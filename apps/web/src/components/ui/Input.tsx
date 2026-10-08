import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cx } from './cx';
import { CONTROL_CLASS } from './field-utils';

/*
 * Form controls. Put them inside <Field>, which renders the label, hint and error:
 *
 *   <Field id="city" label="City" error={errors.city}>
 *     <Select id="city" aria-invalid={Boolean(errors.city)} …>…</Select>
 *   </Field>
 *
 * `fieldGap` (default true) adds the space below the label.
 */

interface ControlProps {
  fieldGap?: boolean;
}

export function Input({
  className,
  fieldGap = true,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & ControlProps) {
  return <input className={cx(fieldGap && 'mt-1.5', CONTROL_CLASS, className)} {...rest} />;
}

export function Select({
  className,
  fieldGap = true,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & ControlProps) {
  return (
    <select
      className={cx(fieldGap && 'mt-1.5', CONTROL_CLASS, 'appearance-auto pr-3', className)}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className,
  fieldGap = true,
  rows = 4,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps) {
  return (
    <textarea
      rows={rows}
      className={cx(fieldGap && 'mt-1.5', CONTROL_CLASS, 'resize-y', className)}
      {...rest}
    />
  );
}

/** A checkbox or radio with its label: the whole row is the touch target. */
export function Choice({
  label,
  className,
  type = 'checkbox',
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  type?: 'checkbox' | 'radio';
}) {
  return (
    <label
      className={cx(
        'flex min-h-11 cursor-pointer items-center gap-3 text-body has-disabled:cursor-not-allowed has-disabled:text-muted',
        className,
      )}
    >
      <input type={type} className="size-5 shrink-0 accent-brand-600" {...rest} />
      {label}
    </label>
  );
}
