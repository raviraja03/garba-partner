// Interests and matches. See docs/matching/interests.md.
import * as z from 'zod/mini';

/** `POST /api/v1/interests`. The sender always comes from the session, never from the body. */
export const sendInterestSchema = z.strictObject({
  receiverId: z.uuid('Invalid member.'),
  /** Optional context: only accepted when both members are looking for a partner at the event. */
  eventId: z.optional(z.uuid('Invalid event.')),
});
export type SendInterestInput = z.input<typeof sendInterestSchema>;
export type SendInterestData = z.output<typeof sendInterestSchema>;

/** `GET /api/v1/interests/received|sent` and `GET /api/v1/matches`. */
export const connectionListQuerySchema = z.strictObject({
  cursor: z.optional(z.string().check(z.maxLength(200))),
  limit: z.optional(
    z.pipe(z.string().check(z.regex(/^\d{1,3}$/, 'limit must be a number')), z.transform(Number)),
  ),
});
export type ConnectionListQueryData = z.output<typeof connectionListQuerySchema>;
