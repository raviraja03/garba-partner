import type {
  ReportReason,
  ReportResolutionAction,
  ReportSource,
  ReportStatus,
  SafetyEventType,
  SafetySeverity,
  SanctionType,
  SuspiciousActivityTrigger,
  UserStatus,
  VerificationFailureReason,
  VerificationProvider,
  VerificationStatus,
  VerificationType,
} from '../../constants/enums.js';
import type { AdminMessageDto } from './chat.dto.js';

// --- Verification ---------------------------------------------------------------------------

/**
 * `GET /api/v1/verification/status`. Verification confirms specific facts only; it never
 * guarantees a person's identity, intentions or safety (docs/safety/identity-verification.md).
 */
export interface VerificationStatusDto {
  /** Every account has passed mobile OTP verification. */
  phone: { verified: true };
  identity: {
    /** Whether identity verification is offered in this environment. */
    available: boolean;
    status: 'not_started' | VerificationStatus;
    verifiedAt: string | null;
    /** Only set after a rejection. */
    failureReason: VerificationFailureReason | null;
    canStart: boolean;
    startsRemainingToday: number;
  };
  photo: { verified: boolean };
}

/** `POST /api/v1/verification/start` */
export interface StartVerificationResultDto {
  /** Where to send the member (the provider's hosted flow). */
  redirectUrl: string;
  expiresAt: string;
}

// --- Blocks & reports -----------------------------------------------------------------------

export interface BlockedMemberDto {
  userId: string;
  /** Display name if the member still has a profile. */
  name: string | null;
  thumbnailUrl: string | null;
  blockedAt: string;
}

export interface ReportCreatedDto {
  reportId: string;
  /** True when an open report from this member about the same person already existed. */
  alreadyReported: boolean;
  blocked: boolean;
}

/**
 * A moderator warning as the member sees it: the guideline it cites and when. Never includes
 * the internal note, the report or who reported.
 */
export interface MemberWarningDto {
  id: string;
  guideline: { id: string; title: string; summary: string } | null;
  issuedAt: string;
  acknowledgedAt: string | null;
}

/** `GET /api/v1/me/safety`: restrictions and unacknowledged warnings on the member's account. */
export interface MySafetyStatusDto {
  accountStatus: UserStatus;
  /** Set for a timed suspension; null when suspended until reviewed (or not suspended). */
  suspendedUntil: string | null;
  chatRestricted: boolean;
  /** Set for a timed chat restriction. */
  chatRestrictedUntil: string | null;
  /** Warnings not yet acknowledged, newest first. */
  warnings: MemberWarningDto[];
}

// --- Admin ----------------------------------------------------------------------------------

/** A sanction as moderators see it (docs/safety/admin-actions.md). */
export interface AdminSanctionDto {
  id: string;
  userId: string;
  type: SanctionType;
  reasonCode: ReportReason;
  /** Internal moderator note. Never shown to the member. */
  note: string;
  reportId: string | null;
  startsAt: string;
  endsAt: string | null;
  createdByAdminId: string;
  acknowledgedAt: string | null;
  revokedAt: string | null;
  revokedByAdminId: string | null;
  revokeReason: string | null;
  expiredAt: string | null;
  /** Not revoked and not expired. */
  active: boolean;
  createdAt: string;
}

/** Row of `GET /api/v1/admin/audit-logs` (`audit:view`). The IP hash is never returned. */
export interface AdminAuditLogDto {
  id: string;
  admin: { id: string; name: string | null };
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminReportUserDto {
  id: string;
  name: string | null;
  accountStatus: UserStatus;
}

export interface AdminReportListItemDto {
  id: string;
  reason: ReportReason;
  priority: 0 | 1 | 2;
  status: ReportStatus;
  source: ReportSource;
  reportedUser: AdminReportUserDto;
  reporter: AdminReportUserDto | null;
  assignedAdminId: string | null;
  openReportsAgainstUser: number;
  /** The report is about chat messages (evidence includes a message snapshot). */
  involvesChat: boolean;
  /** System reports: the automated detection that raised it. */
  trigger: SuspiciousActivityTrigger | null;
  createdAt: string;
}

export interface AdminReportDetailDto extends AdminReportListItemDto {
  details: string | null;
  /** Snapshot of the reported profile at report time (public fields only). */
  evidence: {
    profile: {
      name: string;
      bio: string | null;
      imageUrl: string | null;
    } | null;
    /** Messages copied at report time (reported message + earlier context). */
    messages: AdminMessageDto[];
    /** System reports: counts and IDs behind the automated flag. */
    signals: Record<string, unknown> | null;
  };
  /**
   * Whether a moderator may open the live conversation around the reported message: only for
   * chat reports that are still open or in review. Every access is audited.
   */
  conversationAvailable: boolean;
  reportedUserHiddenFromDiscovery: boolean;
  resolution: {
    action: ReportResolutionAction;
    note: string;
    resolvedByAdminId: string;
    resolvedAt: string;
  } | null;
  otherReports: { id: string; reason: ReportReason; status: ReportStatus; createdAt: string }[];
  /** The reported member's sanction history, newest first. */
  sanctions: AdminSanctionDto[];
  /** The reported member currently can't send messages. */
  reportedUserChatRestricted: boolean;
}

export interface AdminVerificationListItemDto {
  id: string;
  user: { id: string; name: string | null };
  type: VerificationType;
  provider: VerificationProvider;
  providerReference: string | null;
  status: VerificationStatus;
  failureReason: VerificationFailureReason | null;
  createdAt: string;
  verifiedAt: string | null;
}

export interface SafetyLogDto {
  id: string;
  eventType: SafetyEventType;
  severity: SafetySeverity;
  userId: string | null;
  adminId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
