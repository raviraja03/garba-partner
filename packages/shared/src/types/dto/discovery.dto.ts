import type { AttendanceStatus, MatchHighlight } from '../../constants/enums.js';
import type { PublicProfileDto } from './profile.dto.js';

/** An upcoming event both members are looking for a partner at (reciprocal opt-in). */
export interface SharedEventDto {
  id: string;
  slug: string;
  name: string;
  eventDate: string;
}

/**
 * A suggested partner (`GET /api/v1/partners`, `GET /api/v1/partners/:id`).
 *
 * The ranking score is internal and NEVER returned: `highlights` explain in plain terms why the
 * person was suggested, without implying compatibility or safety.
 */
export interface PartnerDto {
  /** The public allow-list profile (no phone, date of birth, Instagram or exact location). */
  profile: PublicProfileDto;
  highlights: MatchHighlight[];
  /** Upcoming dates both members listed as available. */
  sharedDates: string[];
  /** At most `LIMITS.SHARED_EVENTS_SHOWN`, soonest first. */
  sharedEvents: SharedEventDto[];
}

/** The member's own attendance for one event (`GET/PUT /api/v1/events/:eventId/attendance`). */
export interface MyAttendanceDto {
  eventId: string;
  status: AttendanceStatus;
  lookingForPartner: boolean;
  updatedAt: string;
}

/** `GET /api/v1/me/attendance`: the member's attendance at upcoming events. */
export interface MyEventAttendanceDto extends MyAttendanceDto {
  event: SharedEventDto & { startTime: string; city: { id: string; name: string } };
}
