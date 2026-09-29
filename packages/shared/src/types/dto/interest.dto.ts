import type { ConnectionStatus, InterestStatus, MatchStatus } from '../../constants/enums.js';
import type { SharedEventDto } from './discovery.dto.js';
import type { PublicProfileDto } from './profile.dto.js';

/**
 * A pending interest in the member's Received or Sent list. `member` is the OTHER person's public
 * allow-list profile. Declined, expired and cancelled interests are never listed, so a sender is
 * never told that they were declined.
 */
export interface InterestDto {
  id: string;
  status: InterestStatus;
  createdAt: string;
  expiresAt: string;
  event: SharedEventDto | null;
  member: PublicProfileDto;
}

/** `POST /api/v1/interests` result. */
export interface SendInterestResultDto {
  interestId: string;
  /** True when the other member had already sent an interest: a match was created instead. */
  matched: boolean;
  match: MatchDto | null;
  /** True when an identical pending interest already existed (the request is idempotent). */
  alreadySent: boolean;
}

/** An active match, from the viewer's side. */
export interface MatchDto {
  id: string;
  status: MatchStatus;
  createdAt: string;
  event: SharedEventDto | null;
  partner: PublicProfileDto;
}

/** The viewer's relationship with a member shown in discovery. */
export interface ConnectionDto {
  status: ConnectionStatus;
  /** The pending interest (sent or received), if any. */
  interestId: string | null;
  matchId: string | null;
}

// --- Admin (users:view) --------------------------------------------------------------------

/** Counts on the admin user detail page. Never message content (there is none yet). */
export interface AdminConnectionSummaryDto {
  activeMatches: number;
  pendingInterestsSent: number;
  pendingInterestsReceived: number;
  interestsSentLast24h: number;
}

export interface AdminMatchDto {
  id: string;
  status: MatchStatus;
  partner: { id: string; name: string | null };
  eventName: string | null;
  createdAt: string;
  endedAt: string | null;
}
