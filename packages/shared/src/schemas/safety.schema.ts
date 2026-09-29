import * as z from 'zod/mini';
import {
  REPORT_REASONS,
  REPORT_RESOLUTION_ACTIONS,
  REPORT_SOURCES,
  REPORT_STATUSES,
  SANCTION_DURATION_DAYS,
  SAFETY_EVENT_TYPES,
  SAFETY_SEVERITIES,
  VERIFICATION_STATUSES,
  VERIFICATION_TYPES,
} from '../constants/enums.js';
import { LIMITS } from '../constants/limits.js';
import { stripInvisible } from '../utils/text.js';

// --- Member ---------------------------------------------------------------------------------

/** `POST /api/v1/blocks` */
export const createBlockSchema = z.strictObject({
  userId: z.uuid('Invalid member.'),
});
export type CreateBlockInput = z.input<typeof createBlockSchema>;

/** `POST /api/v1/reports` */
export const createReportSchema = z.strictObject({
  reportedUserId: z.uuid('Invalid member.'),
  reason: z.enum(REPORT_REASONS, 'Choose a reason.'),
  details: z.optional(
    z.nullable(
      z.pipe(
        z
          .string()
          .check(
            z.maxLength(
              LIMITS.REPORT_DETAILS_MAX_LENGTH,
              `Please keep details under ${String(LIMITS.REPORT_DETAILS_MAX_LENGTH)} characters.`,
            ),
          ),
        z.transform((value) => {
          const details = stripInvisible(value).trim();
          return details === '' ? null : details;
        }),
      ),
    ),
  ),
  /** Also block the member (default true in the app). */
  alsoBlock: z.optional(z.boolean()),
  /**
   * Report a specific chat message. It must be a message the REPORTED member sent in a chat the
   * reporter belongs to; it and up to 10 earlier messages are copied into the report as evidence.
   */
  messageId: z.optional(z.uuid('Invalid message.')),
});
export type CreateReportInput = z.input<typeof createReportSchema>;

/** Development-only simulated provider completion (IDENTITY_PROVIDER=mock). */
export const simulateVerificationSchema = z.strictObject({
  reference: z.string().check(z.minLength(1), z.maxLength(100)),
  outcome: z.enum(['approved', 'pending', 'rejected', 'underage', 'cancelled']),
});
export type SimulateVerificationInput = z.input<typeof simulateVerificationSchema>;

// --- Admin ----------------------------------------------------------------------------------

const cursor = z.optional(z.string().check(z.maxLength(300)));
const limit = z.optional(
  z.pipe(z.string().check(z.regex(/^\d{1,3}$/, 'limit must be a number')), z.transform(Number)),
);

/** `GET /api/v1/admin/reports` */
export const adminReportListQuerySchema = z.strictObject({
  status: z.optional(z.enum(REPORT_STATUSES)),
  priority: z.optional(z.enum(['0', '1', '2'])),
  reason: z.optional(z.enum(REPORT_REASONS)),
  /** `system` = automated suspicious-activity flags. */
  source: z.optional(z.enum(REPORT_SOURCES)),
  cursor,
  limit,
});
export type AdminReportListQueryData = z.output<typeof adminReportListQuerySchema>;

/** `POST /api/v1/admin/reports/:id/resolve` */
export const adminResolveReportSchema = z.strictObject({
  action: z.enum(REPORT_RESOLUTION_ACTIONS),
  note: z
    .string()
    .check(
      z.trim(),
      z.minLength(
        LIMITS.ADMIN_RESOLUTION_NOTE_MIN,
        `Note must be at least ${String(LIMITS.ADMIN_RESOLUTION_NOTE_MIN)} characters.`,
      ),
      z.maxLength(LIMITS.ADMIN_RESOLUTION_NOTE_MAX),
    ),
  /** Remove the automatic "hidden from discovery" flag set by reports. */
  clearAutoHide: z.optional(z.boolean()),
  /** `suspend` / `restrict_chat` only: length in days (omit = until a moderator lifts it). */
  durationDays: z.optional(z.literal(SANCTION_DURATION_DAYS)),
});
export type AdminResolveReportInput = z.input<typeof adminResolveReportSchema>;

/** Internal moderator note (stored with the sanction and in the audit log, never shown to members). */
const adminNote = z
  .string()
  .check(
    z.trim(),
    z.minLength(
      LIMITS.ADMIN_ACTION_REASON_MIN,
      `Reason must be at least ${String(LIMITS.ADMIN_ACTION_REASON_MIN)} characters.`,
    ),
    z.maxLength(LIMITS.ADMIN_ACTION_REASON_MAX),
  );

/**
 * `POST /api/v1/admin/users/:userId/{warn,restrict-chat,suspend,ban}`. `reasonCode` is the
 * guideline category (the member sees it on a warning); `reason` is the internal note.
 */
export const adminSanctionSchema = z.strictObject({
  reason: adminNote,
  reasonCode: z.optional(z.enum(REPORT_REASONS)),
  /** `suspend` / `restrict-chat` only. Omit = until a moderator lifts it. */
  durationDays: z.optional(z.literal(SANCTION_DURATION_DAYS)),
});
export type AdminSanctionInput = z.input<typeof adminSanctionSchema>;
export type AdminSanctionData = z.output<typeof adminSanctionSchema>;

/** `GET /api/v1/admin/audit-logs` */
export const adminAuditLogQuerySchema = z.strictObject({
  action: z.optional(z.string().check(z.regex(/^[a-z_]+(\.[a-z_]+)+$/, 'Invalid action.'))),
  targetType: z.optional(z.string().check(z.regex(/^[a-z_]{2,30}$/, 'Invalid target type.'))),
  targetId: z.optional(z.uuid()),
  adminId: z.optional(z.uuid()),
  cursor,
  limit,
});
export type AdminAuditLogQueryData = z.output<typeof adminAuditLogQuerySchema>;

/** `GET /api/v1/admin/verifications` */
export const adminVerificationListQuerySchema = z.strictObject({
  status: z.optional(z.enum(VERIFICATION_STATUSES)),
  type: z.optional(z.enum(VERIFICATION_TYPES)),
  cursor,
  limit,
});
export type AdminVerificationListQueryData = z.output<typeof adminVerificationListQuerySchema>;

/** `GET /api/v1/admin/safety-logs` */
export const adminSafetyLogQuerySchema = z.strictObject({
  eventType: z.optional(z.enum(SAFETY_EVENT_TYPES)),
  severity: z.optional(z.enum(SAFETY_SEVERITIES)),
  userId: z.optional(z.uuid()),
  cursor,
  limit,
});
export type AdminSafetyLogQueryData = z.output<typeof adminSafetyLogQuerySchema>;
