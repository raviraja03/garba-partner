import type * as z from 'zod/mini';
import { AppError } from './app-error.js';

/**
 * Validates untrusted input with a shared schema. Failures become VALIDATION_ERROR with
 * `details` listing each invalid field (never the submitted values).
 */
export function parseInput<TSchema extends z.ZodMiniType>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', {
      details: result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}
