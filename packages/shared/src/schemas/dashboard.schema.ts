import * as z from 'zod/mini';
import { LIMITS } from '../constants/limits.js';
import { isIsoDate } from '../utils/dates.js';

const isoDate = z.string().check(z.refine(isIsoDate, 'Use a date like 2026-10-01.'));

/**
 * Dashboard filters (`GET /api/v1/admin/dashboard/*`). Dates are India Standard Time and
 * inclusive; defaults are the last 30 days. Range rules (from ≤ to, at most a year) need today's
 * date and are checked by the service.
 */
export const adminDashboardQuerySchema = z.strictObject({
  from: z.optional(isoDate),
  to: z.optional(isoDate),
  cityId: z.optional(z.uuid('Invalid city.')),
});
export type AdminDashboardQueryData = z.output<typeof adminDashboardQuerySchema>;

/** `GET /api/v1/admin/dashboard/events`: the filters plus pagination. */
export const adminDashboardEventsQuerySchema = z.strictObject({
  from: z.optional(isoDate),
  to: z.optional(isoDate),
  cityId: z.optional(z.uuid('Invalid city.')),
  cursor: z.optional(z.string().check(z.maxLength(300))),
  limit: z.optional(
    z.pipe(
      z.string().check(z.regex(/^\d{1,3}$/, 'limit must be a number')),
      z.transform((value) => Math.min(Math.max(Number(value), 1), LIMITS.ADMIN_PAGE_SIZE_MAX)),
    ),
  ),
});
export type AdminDashboardEventsQueryData = z.output<typeof adminDashboardEventsQuerySchema>;
