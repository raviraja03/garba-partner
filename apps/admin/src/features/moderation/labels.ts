import type {
  SanctionDurationDays,
  SanctionType,
  SuspiciousActivityTrigger,
} from '@garba-partner/shared';

export const SANCTION_LABELS: Record<SanctionType, string> = {
  warning: 'Warning',
  chat_restriction: 'Chat restriction',
  suspension: 'Suspension',
  ban: 'Ban',
};

/** Automated flags (source = system). A flag is a lead for review, never proof. */
export const TRIGGER_LABELS: Record<SuspiciousActivityTrigger, string> = {
  money_requests: 'Automated flag: repeated money requests',
  repeated_messages: 'Automated flag: same message sent to many chats',
  frequently_blocked: 'Automated flag: blocked by many members',
};

export const DURATION_LABELS: Record<SanctionDurationDays, string> = {
  1: '1 day',
  3: '3 days',
  7: '7 days',
  30: '30 days',
};
