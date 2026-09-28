export const INPUT_CLASS =
  'mt-1 w-full rounded-xl bg-white px-4 py-3 ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-brand-600 aria-invalid:ring-2 aria-invalid:ring-danger disabled:bg-black/5';

/** aria-describedby value for a field rendered with <Field>. */
export function describedBy(id: string, error: string | undefined, hasHint = false) {
  if (error) return `${id}-error`;
  return hasHint ? `${id}-hint` : undefined;
}
