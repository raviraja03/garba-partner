import * as z from 'zod/mini';
import { LIMITS } from '../constants/limits.js';

/** `GET /api/v1/notifications` (newest first; `cursor` loads older ones). */
export const notificationListQuerySchema = z.strictObject({
  cursor: z.optional(z.string().check(z.maxLength(200))),
  limit: z.optional(
    z.pipe(
      z.string().check(z.regex(/^\d{1,3}$/, 'limit must be a number')),
      z.transform((value) =>
        Math.min(Math.max(Number(value), 1), LIMITS.NOTIFICATIONS_PAGE_SIZE_MAX),
      ),
    ),
  ),
  /** `true` = unread only. */
  unread: z.optional(z.enum(['true', 'false'])),
});
export type NotificationListQueryData = z.output<typeof notificationListQuerySchema>;

/**
 * `PUT /api/v1/notifications/preferences`: any subset of the configurable types. `safety` is not
 * accepted: safety notifications can't be turned off.
 */
export const updateNotificationPreferencesSchema = z
  .strictObject({
    interest_received: z.optional(z.boolean()),
    interest_accepted: z.optional(z.boolean()),
    match_created: z.optional(z.boolean()),
    new_message: z.optional(z.boolean()),
    verification_completed: z.optional(z.boolean()),
    event_reminder: z.optional(z.boolean()),
  })
  .check(z.refine((value) => Object.keys(value).length > 0, 'Change at least one preference.'));
export type UpdateNotificationPreferencesInput = z.input<
  typeof updateNotificationPreferencesSchema
>;
