import * as z from 'zod/mini';
import { USER_STATUSES } from '../constants/enums.js';
import { LIMITS } from '../constants/limits.js';

/** `GET /api/v1/admin/users` query string (all values arrive as strings). */
export const adminUserListQuerySchema = z.strictObject({
  q: z.optional(z.string().check(z.trim(), z.maxLength(100))),
  status: z.optional(z.enum(USER_STATUSES)),
  cursor: z.optional(z.string().check(z.maxLength(200))),
  limit: z.optional(
    z.pipe(z.string().check(z.regex(/^\d{1,3}$/, 'limit must be a number')), z.transform(Number)),
  ),
});
export type AdminUserListQuery = z.input<typeof adminUserListQuerySchema>;
export type AdminUserListQueryData = z.output<typeof adminUserListQuerySchema>;

/** Body of suspend / reactivate. The reason is stored in the admin audit log. */
export const adminUserActionSchema = z.strictObject({
  reason: z
    .string()
    .check(
      z.trim(),
      z.minLength(
        LIMITS.ADMIN_ACTION_REASON_MIN,
        `Reason must be at least ${String(LIMITS.ADMIN_ACTION_REASON_MIN)} characters.`,
      ),
      z.maxLength(LIMITS.ADMIN_ACTION_REASON_MAX),
    ),
});
export type AdminUserActionInput = z.input<typeof adminUserActionSchema>;
