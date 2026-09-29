import { Op, UniqueConstraintError } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { Logger } from 'pino';
import {
  LIMITS,
  REPORT_PRIORITY_BY_REASON,
  type ReportReason,
  type SuspiciousActivityTrigger,
} from '@garba-partner/shared';
import { Block, Message, Report, UserProfile, type ReportEvidence } from '../../models/index.js';
import type { SafetyLogger } from './safety-log.service.js';
import { hideFromDiscovery } from './sanctions.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Flagged messages copied into the evidence (the suspected member's own messages only). */
const EVIDENCE_MESSAGES = 5;

type EvidenceMessage = NonNullable<ReportEvidence['messages']>[number];

export interface SuspiciousActivityDetector {
  /** Runs after a message is stored (and committed). Never throws. */
  afterMessage(message: Message): Promise<void>;
  /** Runs after a new block is stored (and committed). Never throws. */
  afterBlock(blockedUserId: string): Promise<void>;
}

interface Detection {
  userId: string;
  trigger: SuspiciousActivityTrigger;
  reason: ReportReason;
  signals: Record<string, unknown>;
  /** Hide the member from discovery until a moderator reviews (never a suspension or ban). */
  hide: boolean;
  messages?: EvidenceMessage[];
}

/**
 * Suspicious-activity detection (docs/safety/abuse-prevention.md#4-suspicious-activity-detection).
 * A detection opens ONE `source = 'system'` report per member and trigger in the moderation queue
 * (later detections refresh its signals) and records a safety log entry. The strongest automatic
 * action is hiding the member from discovery pending review: the platform NEVER suspends or bans
 * on its own, because a pattern match is not a verified violation.
 */
export function createSuspiciousActivityDetector(deps: {
  sequelize: Sequelize;
  safetyLog: SafetyLogger;
  logger: Logger;
}): SuspiciousActivityDetector {
  const { sequelize, safetyLog, logger } = deps;

  async function flag(detection: Detection): Promise<void> {
    const { userId, trigger } = detection;
    const outcome = await sequelize.transaction(async (transaction) => {
      const open = await Report.findAll({
        where: { reportedUserId: userId, source: 'system', status: ['open', 'in_review'] },
        transaction,
      });
      const existing = open.find((report) => report.evidence.trigger === trigger);
      if (existing) {
        // Already in the queue: refresh the signals, don't add another report.
        await existing.update(
          {
            evidence: {
              ...existing.evidence,
              signals: { ...detection.signals, lastDetectedAt: new Date().toISOString() },
            },
          },
          { transaction },
        );
        return null;
      }
      const profile = await UserProfile.findOne({
        where: { userId },
        attributes: ['displayName', 'bio', 'imagePublicId'],
        transaction,
      });
      const report = await Report.create(
        {
          source: 'system',
          reporterId: null,
          reportedUserId: userId,
          reason: detection.reason,
          priority: REPORT_PRIORITY_BY_REASON[detection.reason],
          evidence: {
            trigger,
            signals: { ...detection.signals, lastDetectedAt: new Date().toISOString() },
            profile: profile
              ? {
                  name: profile.displayName,
                  bio: profile.bio,
                  imagePublicId: profile.imagePublicId,
                }
              : null,
            ...(detection.messages ? { messages: detection.messages } : {}),
          },
        },
        { transaction },
      );
      const hidden = detection.hide
        ? await hideFromDiscovery(userId, 'suspicious_activity', transaction)
        : false;
      return { reportId: report.id, hidden };
    });
    if (!outcome) return;
    await safetyLog.record({
      eventType: `suspicious.${trigger}`,
      severity: 'warning',
      userId,
      metadata: { reportId: outcome.reportId, hidden: outcome.hidden, ...detection.signals },
    });
    if (outcome.hidden) {
      await safetyLog.record({
        eventType: 'safety.auto_hidden',
        severity: 'warning',
        userId,
        metadata: { reason: 'suspicious_activity', reportId: outcome.reportId, trigger },
      });
    }
  }

  /** Detections race each other only on the unique index; the loser simply does nothing. */
  async function safely(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (err instanceof UniqueConstraintError) return;
      logger.error({ err, detection: label }, 'Suspicious-activity detection failed');
    }
  }

  const snapshot = (m: Message): EvidenceMessage => ({
    id: m.id,
    senderRole: 'reported',
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    reported: true,
    containsContactInfo: m.containsContactInfo,
  });

  return {
    async afterMessage(message) {
      const senderId = message.senderId;

      if (message.containsMoneyRequest) {
        await safely('money_requests', async () => {
          const since = new Date(Date.now() - LIMITS.SUSPICIOUS_MONEY_WINDOW_HOURS * HOUR_MS);
          const flagged = await Message.findAll({
            where: { senderId, containsMoneyRequest: true, createdAt: { [Op.gt]: since } },
            order: [
              ['createdAt', 'DESC'],
              ['id', 'DESC'],
            ],
            limit: 50,
          });
          if (flagged.length < LIMITS.SUSPICIOUS_MONEY_MESSAGES) return;
          await flag({
            userId: senderId,
            trigger: 'money_requests',
            reason: 'asking_for_money',
            hide: true,
            signals: {
              moneyRequestMessages: flagged.length,
              chats: new Set(flagged.map((m) => m.matchId)).size,
              windowHours: LIMITS.SUSPICIOUS_MONEY_WINDOW_HOURS,
            },
            messages: flagged.slice(0, EVIDENCE_MESSAGES).reverse().map(snapshot),
          });
        });
      }

      if (message.body.length >= LIMITS.SUSPICIOUS_REPEATED_MIN_LENGTH) {
        await safely('repeated_messages', async () => {
          const since = new Date(Date.now() - LIMITS.SUSPICIOUS_REPEATED_WINDOW_HOURS * HOUR_MS);
          const chats = await Message.count({
            where: { senderId, body: message.body, createdAt: { [Op.gt]: since } },
            distinct: true,
            col: 'match_id',
          });
          if (chats < LIMITS.SUSPICIOUS_REPEATED_MESSAGE_CHATS) return;
          await flag({
            userId: senderId,
            trigger: 'repeated_messages',
            reason: 'spam',
            hide: true,
            signals: {
              sameMessageChats: chats,
              windowHours: LIMITS.SUSPICIOUS_REPEATED_WINDOW_HOURS,
            },
            messages: [snapshot(message)],
          });
        });
      }
    },

    async afterBlock(blockedUserId) {
      await safely('frequently_blocked', async () => {
        const since = new Date(Date.now() - LIMITS.SUSPICIOUS_BLOCKED_WINDOW_DAYS * DAY_MS);
        const blockers = await Block.count({
          where: { blockedId: blockedUserId, createdAt: { [Op.gt]: since } },
        });
        if (blockers < LIMITS.SUSPICIOUS_BLOCKED_BY_MEMBERS) return;
        // Being blocked is not wrongdoing on its own: flag for review, no automatic hiding.
        await flag({
          userId: blockedUserId,
          trigger: 'frequently_blocked',
          reason: 'other',
          hide: false,
          signals: {
            blockedByMembers: blockers,
            windowDays: LIMITS.SUSPICIOUS_BLOCKED_WINDOW_DAYS,
          },
        });
      });
    },
  };
}
