import { ApiClientError } from '../../lib/api-client';

export type FieldErrors = Partial<Record<string, string>>;

/** First message per field from a zod/mini result. */
export function fieldErrorsFromIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Maps an API error to field errors (VALIDATION_ERROR details) or a form-level message. */
export function fieldErrorsFromApi(error: unknown): FieldErrors {
  if (error instanceof ApiClientError) {
    if (error.details.length > 0) {
      return fieldErrorsFromIssues(
        error.details.map((d) => ({ path: [d.path], message: d.message })),
      );
    }
    return { form: error.message };
  }
  return { form: 'Something went wrong. Please try again.' };
}
