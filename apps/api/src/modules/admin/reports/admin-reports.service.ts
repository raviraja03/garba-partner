import { Op, type WhereOptions } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import {
  LIMITS,
  type AdminConversationDto,
  type AdminMessageDto,
  type AdminReportDetailDto,
  type AdminReportListItemDto,
  type AdminReportListQueryData,
  type AdminReportUserDto,
  type PaginationMeta,
  type ReportResolutionAction,
} from '@garba-partner/shared';
import { AppError } from '../../../lib/app-error.js';
import { Match, Message, Report, User, UserProfile } from '../../../models/index.js';
import type { MediaStorage } from '../../../providers/media/index.js';
import type { RealtimeHub } from '../../../realtime/hub.js';
import {
  cancelPendingInterestsOf,
  emitMatchEnded,
  endAllMatchesOf,
} from '../../interests/connections.js';
import { setAccountStatus } from '../../safety/sanctions.js';
import { recordAdminAction } from '../audit/audit.service.js';
import type { AdminActor } from '../users/admin-users.service.js';

const OPEN_STATUSES = ['open', 'in_review'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResolveReportData {
  action: ReportResolutionAction;
  note: string;
  clearAutoHide?: boolean | undefined;
}

export interface AdminReportsService {
  list(query: AdminReportListQueryData): Promise<{
    items: AdminReportListItemDto[];
    meta: PaginationMeta;
  }>;
  get(reportId: string): Promise<AdminReportDetailDto>;
  /**
   * The live conversation around a reported message. Only for chat reports that are still open
   * or in review (an active safety process), and every access is written to the audit log.
   */
  conversation(actor: AdminActor, reportId: string): Promise<AdminConversationDto>;
  resolve(
    actor: AdminActor,
    reportId: string,
    input: ResolveReportData,
  ): Promise<AdminReportDetailDto>;
}

/** Queue cursor over (priority ASC, created_at ASC, id ASC): most urgent, then oldest. */
function encodeQueueCursor(report: Report): string {
  return Buffer.from(
    JSON.stringify([report.priority, report.createdAt.toISOString(), report.id]),
  ).toString('base64url');
}

function decodeQueueCursor(value: string): { priority: number; createdAt: Date; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 3) {
      const [priority, createdAt, id] = parsed as unknown[];
      if (
        (priority === 0 || priority === 1 || priority === 2) &&
        typeof createdAt === 'string' &&
        !Number.isNaN(Date.parse(createdAt)) &&
        typeof id === 'string' &&
        UUID_PATTERN.test(id)
      ) {
        return { priority, createdAt: new Date(createdAt), id };
      }
    }
  } catch {
    // fall through
  }
  throw new AppError('VALIDATION_ERROR', {
    details: [{ path: 'cursor', message: 'Invalid cursor.' }],
  });
}

/** Reports queue and chat moderation (docs/chat/moderation.md). `reports:manage` only. */
export function createAdminReportsService(deps: {
  sequelize: Sequelize;
  env: ServerEnv;
  media: MediaStorage;
  hub: RealtimeHub;
}): AdminReportsService {
  const { sequelize, env, media, hub } = deps;

  async function people(ids: string[]): Promise<Map<string, AdminReportUserDto>> {
    const unique = [...new Set(ids)];
    const [users, profiles] = await Promise.all([
      User.findAll({ where: { id: unique }, attributes: ['id', 'status'], paranoid: false }),
      UserProfile.findAll({ where: { userId: unique }, attributes: ['userId', 'displayName'] }),
    ]);
    const nameById = new Map(profiles.map((p) => [p.userId, p.displayName]));
    return new Map(
      users.map((u) => [
        u.id,
        { id: u.id, name: nameById.get(u.id) ?? null, accountStatus: u.status },
      ]),
    );
  }

  async function toListItems(reports: Report[]): Promise<AdminReportListItemDto[]> {
    const reportedIds = [...new Set(reports.map((r) => r.reportedUserId))];
    const [users, openCounts] = await Promise.all([
      people([...reportedIds, ...reports.flatMap((r) => (r.reporterId ? [r.reporterId] : []))]),
      Report.findAll({
        where: { reportedUserId: reportedIds, status: [...OPEN_STATUSES] },
        attributes: ['reportedUserId', [sequelize.fn('count', sequelize.col('id')), 'count']],
        group: ['reportedUserId'],
        raw: true,
      }) as unknown as Promise<{ reportedUserId: string; count: string }[]>,
    ]);
    const openById = new Map(openCounts.map((row) => [row.reportedUserId, Number(row.count)]));
    return reports.flatMap((report): AdminReportListItemDto[] => {
      const reportedUser = users.get(report.reportedUserId);
      if (!reportedUser) return [];
      return [
        {
          id: report.id,
          reason: report.reason,
          priority: report.priority,
          status: report.status,
          source: report.source,
          reportedUser,
          reporter: report.reporterId ? (users.get(report.reporterId) ?? null) : null,
          assignedAdminId: report.assignedAdminId,
          openReportsAgainstUser: openById.get(report.reportedUserId) ?? 0,
          involvesChat: report.matchId !== null || (report.evidence.messages?.length ?? 0) > 0,
          createdAt: report.createdAt.toISOString(),
        },
      ];
    });
  }

  async function getDetail(reportId: string): Promise<AdminReportDetailDto> {
    const report = await Report.findByPk(reportId);
    if (!report) throw new AppError('NOT_FOUND', { message: 'Report not found.' });
    const [[item], reportedUser, otherReports] = await Promise.all([
      toListItems([report]),
      User.findByPk(report.reportedUserId, {
        attributes: ['hiddenFromDiscovery'],
        paranoid: false,
      }),
      Report.findAll({
        where: { reportedUserId: report.reportedUserId, id: { [Op.ne]: report.id } },
        attributes: ['id', 'reason', 'status', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit: 10,
      }),
    ]);
    if (!item) throw new AppError('NOT_FOUND', { message: 'Report not found.' });
    const profile = report.evidence.profile ?? null;
    return {
      ...item,
      details: report.details,
      evidence: {
        profile: profile
          ? {
              name: profile.name,
              bio: profile.bio,
              imageUrl: profile.imagePublicId
                ? media.url(profile.imagePublicId, 'thumbnail')
                : null,
            }
          : null,
        messages: report.evidence.messages ?? [],
      },
      conversationAvailable:
        report.matchId !== null && (OPEN_STATUSES as readonly string[]).includes(report.status),
      reportedUserHiddenFromDiscovery: reportedUser?.hiddenFromDiscovery ?? false,
      resolution:
        report.resolutionAction && report.resolvedAt && report.resolvedByAdminId
          ? {
              action: report.resolutionAction,
              note: report.resolutionNote ?? '',
              resolvedByAdminId: report.resolvedByAdminId,
              resolvedAt: report.resolvedAt.toISOString(),
            }
          : null,
      otherReports: otherReports.map((r) => ({
        id: r.id,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  return {
    async list(query) {
      const limit = Math.min(
        Math.max(query.limit ?? LIMITS.ADMIN_PAGE_SIZE_DEFAULT, 1),
        LIMITS.ADMIN_PAGE_SIZE_MAX,
      );
      const conditions: WhereOptions[] = [{ status: query.status ?? [...OPEN_STATUSES] }];
      if (query.priority !== undefined) conditions.push({ priority: Number(query.priority) });
      if (query.cursor) {
        const c = decodeQueueCursor(query.cursor);
        conditions.push({
          [Op.or]: [
            { priority: { [Op.gt]: c.priority } },
            { priority: c.priority, createdAt: { [Op.gt]: c.createdAt } },
            { priority: c.priority, createdAt: c.createdAt, id: { [Op.gt]: c.id } },
          ],
        });
      }
      const rows = await Report.findAll({
        where: { [Op.and]: conditions },
        order: [
          ['priority', 'ASC'],
          ['createdAt', 'ASC'],
          ['id', 'ASC'],
        ],
        limit: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: await toListItems(page),
        meta: { nextCursor: rows.length > limit && last ? encodeQueueCursor(last) : null },
      };
    },

    get: getDetail,

    async conversation(actor, reportId) {
      return sequelize.transaction(async (transaction) => {
        const report = await Report.findByPk(reportId, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!report) throw new AppError('NOT_FOUND', { message: 'Report not found.' });
        if (!report.matchId) {
          throw new AppError('CONFLICT', { message: 'This report is not about a conversation.' });
        }
        if (!(OPEN_STATUSES as readonly string[]).includes(report.status)) {
          throw new AppError('CONFLICT', {
            message: 'Conversations can only be opened while a report is open or in review.',
          });
        }
        const match = await Match.findByPk(report.matchId, {
          attributes: ['id', 'status'],
          transaction,
        });
        if (!match)
          throw new AppError('NOT_FOUND', { message: 'The conversation no longer exists.' });

        // Window around the reported message (or the latest messages if it was deleted).
        const pivot = report.messageId
          ? await Message.findOne({
              where: { id: report.messageId, matchId: match.id },
              transaction,
            })
          : null;
        const window = LIMITS.ADMIN_CONVERSATION_WINDOW;
        const before = await Message.findAll({
          where: {
            matchId: match.id,
            ...(pivot ? { createdAt: { [Op.lte]: pivot.createdAt } } : {}),
          },
          order: [
            ['createdAt', 'DESC'],
            ['id', 'DESC'],
          ],
          limit: window + 1,
          transaction,
        });
        const after = pivot
          ? await Message.findAll({
              where: { matchId: match.id, createdAt: { [Op.gt]: pivot.createdAt } },
              order: [
                ['createdAt', 'ASC'],
                ['id', 'ASC'],
              ],
              limit: window,
              transaction,
            })
          : [];
        const messages: AdminMessageDto[] = [...before.reverse(), ...after].map((m) => ({
          id: m.id,
          senderRole: m.senderId === report.reporterId ? 'reporter' : 'reported',
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          reported: m.id === report.messageId,
          containsContactInfo: m.containsContactInfo,
        }));

        // Opening a conversation is part of reviewing the report.
        if (report.status === 'open' || !report.assignedAdminId) {
          await report.update(
            { status: 'in_review', assignedAdminId: report.assignedAdminId ?? actor.adminId },
            { transaction },
          );
        }
        await recordAdminAction(
          {
            adminId: actor.adminId,
            action: 'report.conversation_view',
            targetType: 'report',
            targetId: report.id,
            metadata: { matchId: match.id, messagesShown: messages.length },
            ip: actor.ip,
          },
          env.OTP_HMAC_SECRET,
          transaction,
        );
        return { reportId: report.id, matchId: match.id, matchStatus: match.status, messages };
      });
    },

    async resolve(actor, reportId, input) {
      const outcome = await sequelize.transaction(async (transaction) => {
        const report = await Report.findByPk(reportId, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!report) throw new AppError('NOT_FOUND', { message: 'Report not found.' });
        if (!(OPEN_STATUSES as readonly string[]).includes(report.status)) {
          throw new AppError('CONFLICT', { message: 'This report has already been resolved.' });
        }
        const userId = report.reportedUserId;
        let endedMatches: [string, string][] = [];

        if (input.action === 'suspend' || input.action === 'ban') {
          const user = await User.findByPk(userId, { attributes: ['id', 'status'], transaction });
          if (!user) throw new AppError('NOT_FOUND', { message: 'Member not found.' });
          if (user.status === 'banned' || user.status === 'pending_deletion') {
            throw new AppError('CONFLICT', { message: `This account is ${user.status}.` });
          }
          // Revokes every session in the same transaction.
          await setAccountStatus(
            userId,
            input.action === 'ban' ? 'banned' : 'suspended',
            transaction,
          );
          if (input.action === 'ban') {
            endedMatches = await endAllMatchesOf(
              userId,
              { endedByAdminId: actor.adminId },
              transaction,
            );
            await cancelPendingInterestsOf(userId, transaction);
          }
        }
        if (input.clearAutoHide && (input.action === 'dismiss' || input.action === 'warn')) {
          await User.update(
            { hiddenFromDiscovery: false, hiddenReason: null },
            { where: { id: userId }, transaction },
          );
        }

        await report.update(
          {
            status: input.action === 'dismiss' ? 'dismissed' : 'resolved',
            resolutionAction: input.action,
            resolutionNote: input.note,
            resolvedByAdminId: actor.adminId,
            resolvedAt: new Date(),
            assignedAdminId: report.assignedAdminId ?? actor.adminId,
          },
          { transaction },
        );
        await recordAdminAction(
          {
            adminId: actor.adminId,
            action: 'report.resolve',
            targetType: 'report',
            targetId: report.id,
            metadata: {
              action: input.action,
              note: input.note,
              reportedUserId: userId,
              clearAutoHide: input.clearAutoHide ?? false,
              matchesEnded: endedMatches.length,
            },
            ip: actor.ip,
          },
          env.OTP_HMAC_SECRET,
          transaction,
        );
        return { userId, endedMatches };
      });

      // After commit: sanctions take effect on open sockets immediately.
      for (const [matchId, partnerId] of outcome.endedMatches) {
        emitMatchEnded(hub, matchId, outcome.userId, partnerId);
      }
      if (input.action === 'suspend' || input.action === 'ban') {
        hub.disconnectUser(outcome.userId, 'account_restricted');
      }
      return getDetail(reportId);
    },
  };
}
