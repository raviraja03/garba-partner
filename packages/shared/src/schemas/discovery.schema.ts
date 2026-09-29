// Partner discovery and event attendance. See docs/matching/discovery.md.
import * as z from 'zod/mini';
import { ATTENDANCE_STATUSES, GARBA_LEVELS, type GarbaLevel } from '../constants/enums.js';
import { LIMITS } from '../constants/limits.js';
import { isoDateSchema } from './profile.schema.js';

const ageParam = z.optional(
  z.pipe(
    z.string().check(z.regex(/^\d{1,3}$/, 'Age must be a whole number.')),
    z.pipe(
      z.transform(Number),
      z
        .int()
        .check(
          z.gte(LIMITS.PREF_AGE_MIN, `Age must be at least ${String(LIMITS.PREF_AGE_MIN)}.`),
          z.lte(LIMITS.MAX_AGE, `Age must be at most ${String(LIMITS.MAX_AGE)}.`),
        ),
    ),
  ),
);

const isGarbaLevel = (value: string): value is GarbaLevel =>
  (GARBA_LEVELS as readonly string[]).includes(value);

/** `beginner,advanced` → `['beginner', 'advanced']` (deduplicated). */
const garbaLevelsParam = z.optional(
  z.pipe(
    z.string().check(z.maxLength(60)),
    z.transform((value, ctx) => {
      const levels = [...new Set(value.split(',').map((level) => level.trim()))].filter(Boolean);
      if (levels.length === 0 || !levels.every(isGarbaLevel)) {
        ctx.issues.push({
          code: 'custom',
          message: `Garba levels must be a comma-separated list of: ${GARBA_LEVELS.join(', ')}.`,
          input: value,
        });
        return [] as GarbaLevel[];
      }
      return levels.filter(isGarbaLevel);
    }),
  ),
);

/**
 * `GET /api/v1/partners` query string. All filters narrow the candidate set further; they can
 * never widen the member's own preferences (age range, gender) or bypass eligibility rules.
 */
export const partnerListQuerySchema = z
  .strictObject({
    /** Event mode: only members looking for a partner at this event (reciprocal). */
    eventId: z.optional(z.uuid('Invalid event.')),
    cityId: z.optional(z.uuid('Invalid city.')),
    minAge: ageParam,
    maxAge: ageParam,
    garbaLevels: garbaLevelsParam,
    /** Available on this IST date (`YYYY-MM-DD`). */
    date: z.optional(isoDateSchema),
    /** Overrides the member's saved "verified only" preference for this search. */
    verifiedOnly: z.optional(
      z.pipe(
        z.enum(['true', 'false']),
        z.transform((value) => value === 'true'),
      ),
    ),
    cursor: z.optional(z.string().check(z.maxLength(200))),
    limit: z.optional(
      z.pipe(z.string().check(z.regex(/^\d{1,3}$/, 'limit must be a number')), z.transform(Number)),
    ),
  })
  .check(
    z.refine(
      (value) =>
        value.minAge === undefined || value.maxAge === undefined || value.minAge <= value.maxAge,
      { message: 'Minimum age must not exceed maximum age.', path: ['maxAge'] },
    ),
  );
export type PartnerListQuery = z.input<typeof partnerListQuerySchema>;
export type PartnerListQueryData = z.output<typeof partnerListQuerySchema>;

/** `PUT /api/v1/events/:eventId/attendance`. */
export const setAttendanceSchema = z.strictObject({
  status: z.enum(ATTENDANCE_STATUSES),
  lookingForPartner: z.boolean(),
});
export type SetAttendanceInput = z.input<typeof setAttendanceSchema>;
export type SetAttendanceData = z.output<typeof setAttendanceSchema>;
