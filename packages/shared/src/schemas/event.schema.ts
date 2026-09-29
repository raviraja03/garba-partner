// Events and organizers — shared by the API (authoritative validation) and the admin/web forms.
// See docs/events/event-api.md.
import * as z from 'zod/mini';
import {
  ADMIN_EVENT_SORTS,
  EVENT_SORTS,
  EVENT_STATUSES,
  ORGANIZER_STATUSES,
} from '../constants/enums.js';
import { LIMITS } from '../constants/limits.js';
import { containsPhoneOrEmail, normalizeText, stripInvisible } from '../utils/text.js';
import { instagramIdSchema, isoDateSchema } from './profile.schema.js';

/** `HH:MM`, 24-hour clock, India Standard Time. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * An absolute `https://` link to a public host: no credentials (`user:pass@`), no whitespace or
 * quote characters. Used for ticket links and organizer websites.
 */
const HTTPS_URL_PATTERN =
  /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#][^\s<>"'`\\]*)?$/i;

export const EVENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isHttpsUrl(value: string): boolean {
  return value.length <= LIMITS.EVENT_URL_MAX && HTTPS_URL_PATTERN.test(value);
}

export function isEventTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

const CONTACT_IN_PUBLIC_TEXT =
  'Remove phone numbers and email addresses. Organizer contact details belong in the private contact fields.';

/** Single-line text: invisible characters removed, NFKC, whitespace collapsed. */
function singleLine(label: string, min: number, max: number) {
  return z.pipe(
    z.string().check(z.maxLength(max * 2, `${label} is too long.`)),
    z.transform((value, ctx) => {
      const text = normalizeText(stripInvisible(value));
      if (text.length < min || text.length > max) {
        ctx.issues.push({
          code: 'custom',
          message: `${label} must be ${String(min)}–${String(max)} characters.`,
          input: value,
        });
      }
      return text;
    }),
  );
}

/** Optional single-line text; empty clears it (null). */
function optionalLine(label: string, max: number) {
  return z.nullable(
    z.pipe(
      z.string().check(z.maxLength(max * 2, `${label} is too long.`)),
      z.transform((value, ctx) => {
        const text = normalizeText(stripInvisible(value));
        if (text.length > max) {
          ctx.issues.push({
            code: 'custom',
            message: `${label} must be at most ${String(max)} characters.`,
            input: value,
          });
        }
        return text === '' ? null : text;
      }),
    ),
  );
}

/** Multi-line public text. Paragraph breaks are kept; phone numbers and emails are rejected. */
function publicParagraphs(label: string, min: number, max: number) {
  return z.pipe(
    z.string().check(z.maxLength(max * 2, `${label} is too long.`)),
    z.transform((value, ctx) => {
      const text = stripInvisible(value)
        .normalize('NFKC')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (text.length < min || text.length > max) {
        ctx.issues.push({
          code: 'custom',
          message:
            min > 0
              ? `${label} must be ${String(min)}–${String(max)} characters.`
              : `${label} must be at most ${String(max)} characters.`,
          input: value,
        });
      } else if (containsPhoneOrEmail(text)) {
        ctx.issues.push({ code: 'custom', message: CONTACT_IN_PUBLIC_TEXT, input: value });
      }
      return text;
    }),
  );
}

/** Optional `https://` link; empty clears it (null). */
export const httpsUrlSchema = z.nullable(
  z.pipe(
    z.string().check(z.maxLength(LIMITS.EVENT_URL_MAX * 2, 'Link is too long.')),
    z.transform((value, ctx) => {
      const url = value.trim();
      if (url === '') return null;
      if (!isHttpsUrl(url)) {
        ctx.issues.push({
          code: 'custom',
          message: 'Enter a full, secure link starting with https://',
          input: value,
        });
      }
      return url;
    }),
  ),
);

export const eventTimeSchema = z
  .string()
  .check(z.refine(isEventTime, 'Enter a time as HH:MM (24-hour, IST).'));

// --- Organizers (admin) ----------------------------------------------------------------------

const organizerFields = {
  // Public
  name: singleLine('Organizer name', LIMITS.ORGANIZER_NAME_MIN, LIMITS.ORGANIZER_NAME_MAX),
  description: z.nullable(publicParagraphs('Description', 0, LIMITS.ORGANIZER_DESCRIPTION_MAX)),
  websiteUrl: httpsUrlSchema,
  instagramHandle: instagramIdSchema,
  // Private — admins only, never returned by public APIs
  contactName: optionalLine('Contact name', LIMITS.ORGANIZER_CONTACT_NAME_MAX),
  contactEmail: z.nullable(
    z.pipe(
      z.string().check(z.maxLength(254, 'Email is too long.')),
      z.transform((value, ctx) => {
        const email = value.trim().toLowerCase();
        if (email === '') return null;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          ctx.issues.push({
            code: 'custom',
            message: 'Enter a valid email address.',
            input: value,
          });
        }
        return email;
      }),
    ),
  ),
  contactPhone: z.nullable(
    z.pipe(
      z.string().check(z.maxLength(40, 'Phone number is too long.')),
      z.transform((value, ctx) => {
        const phone = value.trim().replace(/\s+/g, ' ');
        if (phone === '') return null;
        const digits = phone.replace(/\D/g, '');
        if (!/^\+?[\d ()-]+$/.test(phone) || digits.length < 7 || digits.length > 15) {
          ctx.issues.push({ code: 'custom', message: 'Enter a valid phone number.', input: value });
        }
        return phone;
      }),
    ),
  ),
  notes: z.nullable(
    z.pipe(
      z.string().check(z.maxLength(LIMITS.ORGANIZER_NOTES_MAX * 2, 'Notes are too long.')),
      z.transform((value, ctx) => {
        const notes = stripInvisible(value).replace(/\r\n?/g, '\n').trim();
        if (notes.length > LIMITS.ORGANIZER_NOTES_MAX) {
          ctx.issues.push({
            code: 'custom',
            message: `Notes must be at most ${String(LIMITS.ORGANIZER_NOTES_MAX)} characters.`,
            input: value,
          });
        }
        return notes === '' ? null : notes;
      }),
    ),
  ),
};

/** `POST /api/v1/admin/organizers`. Verification and status have their own endpoints. */
export const createOrganizerSchema = z.strictObject({
  name: organizerFields.name,
  description: z.optional(organizerFields.description),
  websiteUrl: z.optional(organizerFields.websiteUrl),
  instagramHandle: z.optional(organizerFields.instagramHandle),
  contactName: z.optional(organizerFields.contactName),
  contactEmail: z.optional(organizerFields.contactEmail),
  contactPhone: z.optional(organizerFields.contactPhone),
  notes: z.optional(organizerFields.notes),
});
export type CreateOrganizerInput = z.input<typeof createOrganizerSchema>;
export type CreateOrganizerData = z.output<typeof createOrganizerSchema>;

/** `PATCH /api/v1/admin/organizers/:organizerId`. */
export const updateOrganizerSchema = z
  .strictObject({
    name: z.optional(organizerFields.name),
    description: z.optional(organizerFields.description),
    websiteUrl: z.optional(organizerFields.websiteUrl),
    instagramHandle: z.optional(organizerFields.instagramHandle),
    contactName: z.optional(organizerFields.contactName),
    contactEmail: z.optional(organizerFields.contactEmail),
    contactPhone: z.optional(organizerFields.contactPhone),
    notes: z.optional(organizerFields.notes),
  })
  .check(z.refine((value) => Object.keys(value).length > 0, 'Change at least one field.'));
export type UpdateOrganizerInput = z.input<typeof updateOrganizerSchema>;
export type UpdateOrganizerData = z.output<typeof updateOrganizerSchema>;

const limitParam = z.optional(
  z.pipe(z.string().check(z.regex(/^\d{1,3}$/, 'limit must be a number')), z.transform(Number)),
);
const booleanParam = z.optional(
  z.pipe(
    z.enum(['true', 'false']),
    z.transform((value) => value === 'true'),
  ),
);
const cursorParam = z.optional(z.string().check(z.maxLength(400)));

/** `GET /api/v1/admin/organizers` query string. */
export const adminOrganizerListQuerySchema = z.strictObject({
  q: z.optional(z.string().check(z.trim(), z.maxLength(100))),
  status: z.optional(z.enum(ORGANIZER_STATUSES)),
  verified: booleanParam,
  cursor: cursorParam,
  limit: limitParam,
});
export type AdminOrganizerListQueryData = z.output<typeof adminOrganizerListQuerySchema>;

// --- Events (admin) --------------------------------------------------------------------------

const eventFields = {
  name: singleLine('Event name', LIMITS.EVENT_NAME_MIN, LIMITS.EVENT_NAME_MAX),
  description: publicParagraphs(
    'Description',
    LIMITS.EVENT_DESCRIPTION_MIN,
    LIMITS.EVENT_DESCRIPTION_MAX,
  ),
  organizerId: z.uuid('Choose an organizer.'),
  cityId: z.uuid('Choose a city.'),
  areaId: z.nullable(z.uuid('Choose an area.')),
  venueName: singleLine('Venue name', 2, LIMITS.EVENT_VENUE_NAME_MAX),
  venueAddress: singleLine('Venue address', 5, LIMITS.EVENT_VENUE_ADDRESS_MAX),
  eventDate: isoDateSchema,
  startTime: eventTimeSchema,
  endTime: eventTimeSchema,
  ticketUrl: httpsUrlSchema,
};

const sameTimes = (value: { startTime?: string | undefined; endTime?: string | undefined }) =>
  value.startTime === undefined || value.startTime !== value.endTime;
const SAME_TIMES_MESSAGE = {
  message:
    'End time must differ from start time. An end time earlier than the start means after midnight.',
  path: ['endTime'],
};

/**
 * `POST /api/v1/admin/events`. Always creates a draft. Date and times are India Standard Time;
 * an end time earlier than the start time means the event ends after midnight.
 * Server-side checks (date not in the past, area belongs to city, organizer active) need the
 * database and today's date, so they live in the service.
 */
export const createEventSchema = z
  .strictObject({
    name: eventFields.name,
    description: eventFields.description,
    organizerId: eventFields.organizerId,
    cityId: eventFields.cityId,
    areaId: z.optional(eventFields.areaId),
    venueName: eventFields.venueName,
    venueAddress: eventFields.venueAddress,
    eventDate: eventFields.eventDate,
    startTime: eventFields.startTime,
    endTime: eventFields.endTime,
    ticketUrl: z.optional(eventFields.ticketUrl),
  })
  .check(z.refine(sameTimes, SAME_TIMES_MESSAGE));
export type CreateEventInput = z.input<typeof createEventSchema>;
export type CreateEventData = z.output<typeof createEventSchema>;

/** `PATCH /api/v1/admin/events/:eventId` (partial). Status/verification have their own endpoints. */
export const updateEventSchema = z
  .strictObject({
    name: z.optional(eventFields.name),
    description: z.optional(eventFields.description),
    organizerId: z.optional(eventFields.organizerId),
    cityId: z.optional(eventFields.cityId),
    areaId: z.optional(eventFields.areaId),
    venueName: z.optional(eventFields.venueName),
    venueAddress: z.optional(eventFields.venueAddress),
    eventDate: z.optional(eventFields.eventDate),
    startTime: z.optional(eventFields.startTime),
    endTime: z.optional(eventFields.endTime),
    ticketUrl: z.optional(eventFields.ticketUrl),
  })
  .check(
    z.refine((value) => Object.keys(value).length > 0, 'Change at least one field.'),
    z.refine(sameTimes, SAME_TIMES_MESSAGE),
  );
export type UpdateEventInput = z.input<typeof updateEventSchema>;
export type UpdateEventData = z.output<typeof updateEventSchema>;

const fromBeforeTo = (value: { from?: string | undefined; to?: string | undefined }) =>
  !value.from || !value.to || value.from <= value.to;
const FROM_TO_MESSAGE = { message: '"from" must be on or before "to".', path: ['to'] };

/** `GET /api/v1/admin/events` query string. */
export const adminEventListQuerySchema = z
  .strictObject({
    q: z.optional(z.string().check(z.trim(), z.maxLength(100))),
    status: z.optional(z.enum(EVENT_STATUSES)),
    cityId: z.optional(z.uuid('Invalid city.')),
    organizerId: z.optional(z.uuid('Invalid organizer.')),
    verified: booleanParam,
    from: z.optional(isoDateSchema),
    to: z.optional(isoDateSchema),
    sort: z.optional(z.enum(ADMIN_EVENT_SORTS)),
    cursor: cursorParam,
    limit: limitParam,
  })
  .check(z.refine(fromBeforeTo, FROM_TO_MESSAGE));
export type AdminEventListQuery = z.input<typeof adminEventListQuerySchema>;
export type AdminEventListQueryData = z.output<typeof adminEventListQuerySchema>;

// --- Events (public) -------------------------------------------------------------------------

/** `GET /api/v1/events` query string. Dates are IST calendar days (`YYYY-MM-DD`). */
export const eventListQuerySchema = z
  .strictObject({
    cityId: z.optional(z.uuid('Invalid city.')),
    from: z.optional(isoDateSchema),
    to: z.optional(isoDateSchema),
    sort: z.optional(z.enum(EVENT_SORTS)),
    cursor: cursorParam,
    limit: limitParam,
  })
  .check(z.refine(fromBeforeTo, FROM_TO_MESSAGE));
export type EventListQuery = z.input<typeof eventListQuerySchema>;
export type EventListQueryData = z.output<typeof eventListQuerySchema>;

/** `:idOrSlug` route parameter: an event UUID or its public slug. */
export const eventIdOrSlugSchema = z
  .string()
  .check(
    z.refine(
      (value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ||
        (value.length <= 140 && EVENT_SLUG_PATTERN.test(value)),
      'Invalid event.',
    ),
  );
