import type { EventStatus, OrganizerStatus } from '../../constants/enums.js';

/**
 * Event and organizer response shapes (docs/events/event-api.md).
 *
 * Public DTOs are an ALLOW-LIST: organizer contact details, internal notes and admin identities
 * exist only in the Admin* DTOs and never appear in public responses.
 *
 * "Verified" means the team checked the listing or organizer is genuine. It is not a guarantee of
 * safety, quality or ticket validity, and the UI must say so.
 */

export interface EventPlaceDto {
  id: string;
  name: string;
}

/** Organizer as members see it (public fields only). */
export interface PublicOrganizerSummaryDto {
  id: string;
  name: string;
  isVerified: boolean;
}

export interface PublicOrganizerDto extends PublicOrganizerSummaryDto {
  description: string | null;
  websiteUrl: string | null;
  instagramHandle: string | null;
}

/** Event card in the public list. Dates/times are India Standard Time. */
export interface EventCardDto {
  id: string;
  slug: string;
  name: string;
  city: EventPlaceDto;
  area: EventPlaceDto | null;
  venueName: string;
  /** `YYYY-MM-DD` (IST). */
  eventDate: string;
  /** `HH:MM` (IST, 24-hour). An end time before the start time means after midnight. */
  startTime: string;
  endTime: string;
  /** ISO 8601 instants derived from the date and times. */
  startsAt: string;
  endsAt: string;
  hasEnded: boolean;
  imageUrl: string | null;
  isVerified: boolean;
  organizer: PublicOrganizerSummaryDto;
  hasTicketUrl: boolean;
}

/** Public event detail (`GET /api/v1/events/:idOrSlug`). */
export interface EventDetailDto extends Omit<EventCardDto, 'organizer'> {
  description: string;
  /** Public venue address (a public place, never a member's location). */
  venueAddress: string;
  /** External pass/ticket page, `https://` only. */
  ticketUrl: string | null;
  organizer: PublicOrganizerDto;
}

// --- Admin -----------------------------------------------------------------------------------

export interface AdminActorDto {
  id: string;
  name: string;
}

/** Private organizer contact details (admins with `events:manage` only). */
export interface OrganizerContactDto {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
}

export interface AdminOrganizerListItemDto {
  id: string;
  name: string;
  isVerified: boolean;
  status: OrganizerStatus;
  createdAt: string;
}

export interface AdminOrganizerDto extends AdminOrganizerListItemDto {
  description: string | null;
  websiteUrl: string | null;
  instagramHandle: string | null;
  verifiedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
  /** null when the viewing admin lacks `events:manage` (e.g. moderators). */
  contact: OrganizerContactDto | null;
  eventCounts: { total: number; upcomingPublished: number };
}

/** Active organizers for the event form picker. */
export interface OrganizerOptionDto {
  id: string;
  name: string;
  isVerified: boolean;
}

export interface AdminEventListItemDto {
  id: string;
  slug: string;
  name: string;
  status: EventStatus;
  isVerified: boolean;
  city: EventPlaceDto;
  organizer: PublicOrganizerSummaryDto;
  eventDate: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  hasEnded: boolean;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminEventDetailDto extends AdminEventListItemDto {
  description: string;
  area: EventPlaceDto | null;
  venueName: string;
  venueAddress: string;
  ticketUrl: string | null;
  imageUrl: string | null;
  verifiedAt: string | null;
  publishedAt: string | null;
  firstPublishedAt: string | null;
  archivedAt: string | null;
  createdBy: AdminActorDto | null;
  updatedBy: AdminActorDto | null;
  /** Only drafts that were never published can be deleted; everything else is archived. */
  canDelete: boolean;
}
