/**
 * The look of every text control. Prefer the `Input`, `Select` and `Textarea` components;
 * this string is exported for the few controls that need custom markup.
 * 16px text: smaller text makes iOS zoom the page when the control is focused.
 */
export const CONTROL_CLASS =
  'w-full min-h-12 rounded-control bg-card px-4 py-3 text-body text-ink ring-1 ring-brand-200 outline-none transition-shadow duration-150 placeholder:text-muted/70 hover:ring-brand-300 focus:ring-2 focus:ring-brand-500 aria-invalid:ring-2 aria-invalid:ring-danger disabled:bg-brand-50 disabled:text-muted';

/** `CONTROL_CLASS` with the gap below a `<Field>` label. */
export const INPUT_CLASS = `mt-1.5 ${CONTROL_CLASS}`;

/** aria-describedby value for a field rendered with <Field>. */
export function describedBy(id: string, error: string | undefined, hasHint = false) {
  if (error) return `${id}-error`;
  return hasHint ? `${id}-hint` : undefined;
}
