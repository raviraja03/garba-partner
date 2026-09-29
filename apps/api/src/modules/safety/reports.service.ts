import { Op } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import {
  LIMITS,
  REPORT_PRIORITY_BY_REASON,
  type ReportCreatedDto,
  type ReportReason,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { Block, Report, User, UserProfile } from '../../models/index.js';
import { endConnections, lockPair } from '../interests/connections.js';
import type { SafetyLogger } from './safety-log.service.js';
import { hideFromDiscovery } from './sanctions.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreateReportData {
  reportedUserId: string;
  reason: ReportReason;
  details?: string | null | undefined;
  alsoBlock?: boolean | undefined;
}

export interface ReportsService {
  create(reporterId: string, input: CreateReportData, ip: string): Promise<ReportCreatedDto>;
}

/**
 * Member reports (docs/safety/reporting.md). The reported member is never told who reported them.
 * Automatic protection: a P0 report (underage, safety threat) or reports from several different
 * members hide the reported member from discovery until a moderator reviews.
 */
export function createReportsService(deps: {
  sequelize: Sequelize;
  safetyLog: SafetyLogger;
}): ReportsService {
  const { sequelize, safetyLog } = deps;

  return {
    async create(reporterId, input, ip) {
      if (reporterId === input.reportedUserId) {
        throw new AppError('VALIDATION_ERROR', {
          details: [{ path: 'reportedUserId', message: "You can't report yourself." }],
        });
      }
      const reported = await User.findByPk(input.reportedUserId, { attributes: ['id'] });
      if (!reported) throw new AppError('NOT_FOUND', { message: 'Member not found.' });

      const recent = await Report.count({
        where: { reporterId, createdAt: { [Op.gt]: new Date(Date.now() - DAY_MS) } },
      });
      if (recent >= LIMITS.REPORTS_PER_DAY) {
        await safetyLog.record({
          eventType: 'safety.report_limit_reached',
          severity: 'warning',
          userId: reporterId,
          ip,
          metadata: { reportsLast24h: recent },
        });
        throw new AppError('RATE_LIMITED', {
          message: 'You have sent a lot of reports today. Our team is reviewing them.',
          retryAfterSeconds: 60 * 60,
        });
      }

      const priority = REPORT_PRIORITY_BY_REASON[input.reason];
      const alsoBlock = input.alsoBlock ?? true;

      const outcome = await sequelize.transaction(async (transaction) => {
        await lockPair(sequelize, reporterId, input.reportedUserId, transaction);
        const existing = await Report.findOne({
          where: {
            reporterId,
            reportedUserId: input.reportedUserId,
            status: ['open', 'in_review'],
          },
          transaction,
        });

        let report = existing;
        if (!report) {
          const profile = await UserProfile.findOne({
            where: { userId: input.reportedUserId },
            attributes: ['displayName', 'bio', 'imagePublicId'],
            transaction,
          });
          report = await Report.create(
            {
              source: 'member',
              reporterId,
              reportedUserId: input.reportedUserId,
              reason: input.reason,
              priority,
              details: input.details ?? null,
              // Evidence survives later edits or deletion of the reported profile.
              evidence: {
                profile: profile
                  ? {
                      name: profile.displayName,
                      bio: profile.bio,
                      imagePublicId: profile.imagePublicId,
                    }
                  : null,
              },
            },
            { transaction },
          );
        }

        let blocked = false;
        if (alsoBlock) {
          await Block.findOrCreate({
            where: { blockerId: reporterId, blockedId: input.reportedUserId },
            defaults: { blockerId: reporterId, blockedId: input.reportedUserId },
            transaction,
          });
          blocked = true;
        }
        // A report separates the two members (like a block): pending interests are cancelled
        // and any active match ends, whether or not the reporter also blocked.
        await endConnections(
          reporterId,
          input.reportedUserId,
          { matchStatus: blocked ? 'blocked' : 'closed', endedByUserId: reporterId },
          transaction,
        );

        let hiddenReason: 'p0_report' | 'report_threshold' | null = null;
        if (!existing) {
          if (priority === 0) {
            hiddenReason = (await hideFromDiscovery(input.reportedUserId, 'p0_report', transaction))
              ? 'p0_report'
              : null;
          } else {
            const since = new Date(Date.now() - LIMITS.AUTO_HIDE_WINDOW_DAYS * DAY_MS);
            const reporters = await Report.count({
              where: {
                reportedUserId: input.reportedUserId,
                source: 'member',
                createdAt: { [Op.gt]: since },
              },
              distinct: true,
              col: 'reporter_id',
              transaction,
            });
            if (
              reporters >= LIMITS.AUTO_HIDE_REPORT_THRESHOLD &&
              (await hideFromDiscovery(input.reportedUserId, 'report_threshold', transaction))
            ) {
              hiddenReason = 'report_threshold';
            }
          }
        }
        return { report, alreadyReported: existing !== null, blocked, hiddenReason };
      });

      if (!outcome.alreadyReported) {
        await safetyLog.record({
          eventType: 'safety.report_created',
          severity: priority === 0 ? 'critical' : priority === 1 ? 'warning' : 'info',
          userId: input.reportedUserId,
          ip,
          metadata: { reportId: outcome.report.id, reason: input.reason, priority, reporterId },
        });
      }
      if (outcome.hiddenReason) {
        await safetyLog.record({
          eventType: 'safety.auto_hidden',
          severity: 'warning',
          userId: input.reportedUserId,
          metadata: { reason: outcome.hiddenReason, reportId: outcome.report.id },
        });
      }

      return {
        reportId: outcome.report.id,
        alreadyReported: outcome.alreadyReported,
        blocked: outcome.blocked,
      };
    },
  };
}
