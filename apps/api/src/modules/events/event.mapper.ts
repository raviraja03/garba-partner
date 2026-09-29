import type {
  AdminEventPassDto,
  EventPassDto,
  AdminEventDetailDto,
  AdminEventListItemDto,
  AdminOrganizerDto,
  AdminOrganizerListItemDto,
  EventCardDto,
  EventDetailDto,
  PublicOrganizerDto,
  PublicOrganizerSummaryDto,
} from '@garba-partner/shared';
import type { AdminUser, Event, EventOrganizer } from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';

/** `20:00:00` (database) → `20:00`. */
export const toHhMm = (time: string): string => time.slice(0, 5);

function loaded<T>(value: T | null | undefined, what: string): T {
  if (!value) throw new Error(`${what} must be loaded`);
  return value;
}

const place = (entity: { id: string; name: string }) => ({ id: entity.id, name: entity.name });
const actor = (admin: AdminUser | null | undefined) =>
  admin ? { id: admin.id, name: admin.name } : null;

// --- Public (allow-list: never contact details, notes or admin identities) --------------------

export function toPublicOrganizerSummaryDto(organizer: EventOrganizer): PublicOrganizerSummaryDto {
  return { id: organizer.id, name: organizer.name, isVerified: organizer.isVerified };
}

export function toPublicOrganizerDto(organizer: EventOrganizer): PublicOrganizerDto {
  return {
    ...toPublicOrganizerSummaryDto(organizer),
    description: organizer.description,
    websiteUrl: organizer.websiteUrl,
    instagramHandle: organizer.instagramHandle,
  };
}

export function toEventCardDto(event: Event, media: MediaStorage, now: Date): EventCardDto {
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    city: place(loaded(event.city, 'Event city')),
    area: event.area ? place(event.area) : null,
    venueName: event.venueName,
    eventDate: event.eventDate,
    startTime: toHhMm(event.startTime),
    endTime: toHhMm(event.endTime),
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    hasEnded: event.endsAt <= now,
    imageUrl: event.imagePublicId ? media.url(event.imagePublicId, 'event_card') : null,
    isVerified: event.isVerified,
    organizer: toPublicOrganizerSummaryDto(loaded(event.organizer, 'Event organizer')),
    hasTicketUrl: event.ticketUrl !== null,
    passPricePaise: event.passPricePaise,
  };
}

/** `pass` comes from `loadEventPass()` (it needs a capacity query). */
export function toEventDetailDto(
  event: Event,
  media: MediaStorage,
  now: Date,
  pass: EventPassDto | null,
): EventDetailDto {
  return {
    ...toEventCardDto(event, media, now),
    imageUrl: event.imagePublicId ? media.url(event.imagePublicId, 'event_banner') : null,
    description: event.description,
    venueAddress: event.venueAddress,
    ticketUrl: event.ticketUrl,
    organizer: toPublicOrganizerDto(loaded(event.organizer, 'Event organizer')),
    pass,
  };
}

// --- Admin ------------------------------------------------------------------------------------

export function toAdminEventListItemDto(
  event: Event,
  media: MediaStorage,
  now: Date,
): AdminEventListItemDto {
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    status: event.status,
    isVerified: event.isVerified,
    city: place(loaded(event.city, 'Event city')),
    organizer: toPublicOrganizerSummaryDto(loaded(event.organizer, 'Event organizer')),
    eventDate: event.eventDate,
    startTime: toHhMm(event.startTime),
    endTime: toHhMm(event.endTime),
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    hasEnded: event.endsAt <= now,
    thumbnailUrl: event.imagePublicId ? media.url(event.imagePublicId, 'thumbnail') : null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

export function toAdminEventDetailDto(
  event: Event,
  media: MediaStorage,
  now: Date,
  pass: AdminEventPassDto,
): AdminEventDetailDto {
  return {
    ...toAdminEventListItemDto(event, media, now),
    description: event.description,
    area: event.area ? place(event.area) : null,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    ticketUrl: event.ticketUrl,
    imageUrl: event.imagePublicId ? media.url(event.imagePublicId, 'event_banner') : null,
    verifiedAt: event.verifiedAt?.toISOString() ?? null,
    publishedAt: event.publishedAt?.toISOString() ?? null,
    firstPublishedAt: event.firstPublishedAt?.toISOString() ?? null,
    archivedAt: event.archivedAt?.toISOString() ?? null,
    createdBy: actor(event.createdBy),
    updatedBy: actor(event.updatedBy),
    canDelete: event.firstPublishedAt === null,
    pass,
  };
}

export function toAdminOrganizerListItemDto(organizer: EventOrganizer): AdminOrganizerListItemDto {
  return {
    id: organizer.id,
    name: organizer.name,
    isVerified: organizer.isVerified,
    status: organizer.status,
    createdAt: organizer.createdAt.toISOString(),
  };
}

/** `includeContact` is true only for admins holding `events:manage`. */
export function toAdminOrganizerDto(
  organizer: EventOrganizer,
  options: { includeContact: boolean; eventCounts: AdminOrganizerDto['eventCounts'] },
): AdminOrganizerDto {
  return {
    ...toAdminOrganizerListItemDto(organizer),
    description: organizer.description,
    websiteUrl: organizer.websiteUrl,
    instagramHandle: organizer.instagramHandle,
    verifiedAt: organizer.verifiedAt?.toISOString() ?? null,
    archivedAt: organizer.archivedAt?.toISOString() ?? null,
    updatedAt: organizer.updatedAt.toISOString(),
    contact: options.includeContact
      ? {
          contactName: organizer.contactName,
          contactEmail: organizer.contactEmail,
          contactPhone: organizer.contactPhone,
          notes: organizer.notes,
        }
      : null,
    eventCounts: options.eventCounts,
  };
}
