import type { SharedEventDto } from './discovery.dto.js';
import type { PublicProfileDto } from './profile.dto.js';

/**
 * One chat message. `senderId` is one of the two match members; clients compare it with their
 * own user ID. Moderation flags (e.g. contact-info detection) are never included.
 */
export interface MessageDto {
  id: string;
  matchId: string;
  senderId: string;
  /** Echo of the sender's idempotency key (lets the sender reconcile optimistic messages). */
  clientMessageId: string;
  body: string;
  createdAt: string;
}

/** A conversation in the chat list (`GET /api/v1/chats`). Active matches only. */
export interface ChatSummaryDto {
  matchId: string;
  partner: PublicProfileDto;
  event: SharedEventDto | null;
  lastMessage: { senderId: string; body: string; createdAt: string } | null;
  /** Messages from the partner after the viewer's last read point. */
  unreadCount: number;
  /** When the partner last read up to (for "Seen"); null if never. */
  partnerLastReadAt: string | null;
  /** Match creation or last message, whichever is later (list order). */
  lastActivityAt: string;
}

/** `GET /api/v1/chats/unread` — for the navigation badge. */
export interface UnreadCountDto {
  total: number;
}

// --- Admin (reports:manage, via a report only) ---------------------------------------------

/** A message as moderators see it: sender shown by role in the report, never by phone. */
export interface AdminMessageDto {
  id: string;
  senderRole: 'reporter' | 'reported';
  body: string;
  createdAt: string;
  /** The message the report is about. */
  reported: boolean;
  /** Server-side contact-details detection (moderation context only). */
  containsContactInfo: boolean;
}

/** `GET /api/v1/admin/reports/:id/conversation` (audited). */
export interface AdminConversationDto {
  reportId: string;
  matchId: string;
  matchStatus: string;
  /** At most `LIMITS.ADMIN_CONVERSATION_WINDOW` messages each side of the reported one. */
  messages: AdminMessageDto[];
}
