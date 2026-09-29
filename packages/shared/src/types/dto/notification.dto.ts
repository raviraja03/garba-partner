import type {
  ConfigurableNotificationType,
  NotificationType,
  SafetyNotificationKind,
  VerificationType,
} from '../../constants/enums.js';

/**
 * A notification as the member sees it (docs/notifications/notifications.md). Contains IDs and
 * public display data only: never phone numbers, locations, message text, report details or
 * moderator notes. The web app writes the wording from `type` and these fields.
 */
export interface NotificationDto {
  id: string;
  type: NotificationType;
  /**
   * The other member (public name and thumbnail), or null when there is none or they are no
   * longer available (suspended, banned, deleted). Blocking removes the notification entirely.
   */
  actor: { id: string; name: string; thumbnailUrl: string | null } | null;
  /** Where the notification leads in the web app (a relative path). */
  link: string | null;
  /** Collapsed `new_message` notifications: messages since the chat was last read. */
  count: number;
  matchId: string | null;
  interestId: string | null;
  event: { id: string; slug: string; name: string; startsAt: string } | null;
  verification: { type: VerificationType; outcome: 'approved' | 'rejected' } | null;
  safety: { kind: SafetyNotificationKind } | null;
  /** Latest occurrence (bumped when a `new_message` notification collapses another message). */
  occurredAt: string;
  readAt: string | null;
}

export interface NotificationUnreadCountDto {
  unread: number;
}

/** `GET/PUT /api/v1/notifications/preferences`. `safety` is always on and not listed. */
export type NotificationPreferencesDto = Record<ConfigurableNotificationType, boolean>;

/** `GET /api/v1/admin/notifications/stats`: aggregates only, no member data. */
export interface AdminNotificationStatsDto {
  generatedAt: string;
  totals: { last24h: number; last7d: number; unread: number; stored: number };
  byType: {
    type: NotificationType;
    last24h: number;
    last7d: number;
    /** Share of the last 7 days' notifications that have been read (null when none). */
    readRate7d: number | null;
    unread: number;
    /** Members who turned this type off (null for `safety`, which can't be turned off). */
    optedOut: number | null;
  }[];
}
