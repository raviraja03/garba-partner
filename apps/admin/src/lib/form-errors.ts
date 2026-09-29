import { ApiClientError } from './api-client';

export type FieldErrors = Record<string, string>;

/** First message per field from a zod `safeParse` failure. */
export function issuesToErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
) {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || 'form';
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Field errors from an API VALIDATION_ERROR/CONFLICT, or a form-level message. */
export function apiErrorToErrors(error: unknown): FieldErrors {
  if (error instanceof ApiClientError) {
    if (error.details.length > 0) {
      return issuesToErrors(
        error.details.map((d) => ({ path: d.path ? [d.path] : [], message: d.message })),
      );
    }
    return { form: error.message };
  }
  return { form: 'Something went wrong. Please try again.' };
}

/** aria-describedby for a control rendered inside <Field>. */
export function describedBy(id: string, error: string | undefined, hasHint = false) {
  if (error) return `${id}-error`;
  return hasHint ? `${id}-hint` : undefined;
}
