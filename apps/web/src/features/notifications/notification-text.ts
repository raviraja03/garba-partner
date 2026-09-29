import type {
  ConfigurableNotificationType,
  NotificationDto,
  SafetyNotificationKind,
} from '@garba-partner/shared';

const SAFETY_TEXT: Record<SafetyNotificationKind, string> = {
  warning_issued:
    'You received a warning from our moderators. Please review our community guidelines.',
  chat_restricted:
    'A moderator restricted messaging on your account. You can still read your chats.',
  account_suspended: 'Your account has been suspended. You can still block and report members.',
  restriction_lifted: 'A restriction on your account has been lifted.',
  report_reviewed: "We've reviewed your report. Thank you for helping keep Garba Partner safe.",
};

/**
 * Wording for a notification. Built only from public data (display name, event name); message
 * text, reports and moderator notes are never part of a notification.
 */
export function notificationText(n: NotificationDto): string {
  const who = n.actor?.name ?? 'A member';
  switch (n.type) {
    case 'interest_received':
      return `${who} would like to dance with you.`;
    case 'interest_accepted':
      return `${who} accepted your interest. It's a match!`;
    case 'match_created':
      return `You and ${n.actor?.name ?? 'another member'} matched!`;
    case 'new_message':
      return n.count > 1
        ? `${String(n.count)} new messages from ${who}.`
        : `New message from ${who}.`;
    case 'verification_completed':
      return n.verification?.outcome === 'approved'
        ? 'Your verification was approved.'
        : 'Your verification could not be approved. You can try again.';
    case 'event_reminder':
      return n.event ? `${n.event.name} starts soon. Have a great night!` : 'An event starts soon.';
    case 'safety':
      return n.safety ? SAFETY_TEXT[n.safety.kind] : 'A notice about your account.';
  }
}

export const PREFERENCE_LABELS: Record<ConfigurableNotificationType, string> = {
  interest_received: 'Someone sends me an interest',
  interest_accepted: 'Someone accepts my interest',
  match_created: 'I get a new match',
  new_message: 'New chat messages',
  verification_completed: 'My verification is reviewed',
  event_reminder: 'Reminders before events I’m going to',
};
