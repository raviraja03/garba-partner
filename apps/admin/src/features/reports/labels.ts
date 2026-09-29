import type { ReportReason, ReportResolutionAction, ReportStatus } from '@garba-partner/shared';

export const REASON_LABELS: Record<ReportReason, string> = {
  underage: 'Under 18',
  safety_threat: 'Safety threat',
  harassment: 'Harassment',
  sexual_content: 'Sexual content',
  hate_speech: 'Hate speech',
  scam_spam: 'Scam / spam',
  fake_profile: 'Fake profile',
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
  warn: 'Warn (record only)',
  suspend: 'Suspend account',
  ban: 'Ban account',
};

export const PRIORITY_LABELS = ['P0 urgent', 'P1 high', 'P2 normal'] as const;
