import type { ReportReason, ReportResolutionAction, ReportStatus } from '@garba-partner/shared';

export const REASON_LABELS: Record<ReportReason, string> = {
  fake_profile: 'Fake profile',
  harassment: 'Harassment',
  spam: 'Spam',
  asking_for_money: 'Asking for money',
  inappropriate_behavior: 'Inappropriate behaviour',
  threatening_behavior: 'Threatening behaviour',
  impersonation: 'Impersonation',
  underage: 'Under 18',
  other: 'Other',
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Open',
  in_review: 'In review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export const ACTION_LABELS: Record<ReportResolutionAction, string> = {
  dismiss: 'Dismiss (no violation)',
  warn: 'Warn (member sees an in-app warning)',
  restrict_chat: 'Restrict chat (can read, not send)',
  suspend: 'Suspend account',
  ban: 'Ban account (permanent)',
};

export const PRIORITY_LABELS = ['P0 urgent', 'P1 high', 'P2 normal'] as const;
