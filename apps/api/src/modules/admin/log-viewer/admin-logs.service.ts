import { Op, type WhereOptions } from 'sequelize';
import {
  LIMITS,
  type AdminAuditLogDto,
  type AdminAuditLogQueryData,
  type AdminSafetyLogQueryData,
  type PaginationMeta,
  type SafetyLogDto,
} from '@garba-partner/shared';
import { decodeCursor, encodeCursor } from '../../../lib/pagination.js';
import { AdminAuditLog, AdminUser, SafetyLog } from '../../../models/index.js';

export interface AdminLogsService {
  safetyLogs(query: AdminSafetyLogQueryData): Promise<{
    items: SafetyLogDto[];
    meta: PaginationMeta;
  }>;
  auditLogs(query: AdminAuditLogQueryData): Promise<{
    items: AdminAuditLogDto[];
    meta: PaginationMeta;
  }>;
}

function pageSize(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? LIMITS.ADMIN_PAGE_SIZE_DEFAULT, 1), LIMITS.ADMIN_PAGE_SIZE_MAX);
}

/** Newest first: (created_at DESC, id DESC). */
function before(cursor: string | undefined): WhereOptions[] {
  if (!cursor) return [];
  const c = decodeCursor(cursor);
  const createdAt = new Date(c.createdAt);
  return [
    {
      [Op.or]: [{ createdAt: { [Op.lt]: createdAt } }, { createdAt, id: { [Op.lt]: c.id } }],
    },
  ];
}

function nextCursor<T extends { createdAt: Date; id: string }>(rows: T[], limit: number) {
  const last = rows.slice(0, limit).at(-1);
  return rows.length > limit && last
    ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
    : null;
}

/**
 * Read-only log viewers (docs/safety/incident-response.md#3-investigating). Both logs are
 * append-only in the database. Neither returns IP hashes. Safety logs never contain message
 * text, phone numbers or OTPs by construction.
 */
export function createAdminLogsService(): AdminLogsService {
  return {
    async safetyLogs(query) {
      const limit = pageSize(query.limit);
      const conditions: WhereOptions[] = [...before(query.cursor)];
      if (query.eventType) conditions.push({ eventType: query.eventType });
      if (query.severity) conditions.push({ severity: query.severity });
      if (query.userId) conditions.push({ userId: query.userId });
      const rows = await SafetyLog.findAll({
        where: { [Op.and]: conditions },
        attributes: ['id', 'eventType', 'severity', 'userId', 'adminId', 'metadata', 'createdAt'],
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: limit + 1,
      });
      return {
        items: rows.slice(0, limit).map((row) => ({
          id: row.id,
          eventType: row.eventType,
          severity: row.severity,
          userId: row.userId,
          adminId: row.adminId,
          metadata: row.metadata,
          createdAt: row.createdAt.toISOString(),
        })),
        meta: { nextCursor: nextCursor(rows, limit) },
      };
    },

    async auditLogs(query) {
      const limit = pageSize(query.limit);
      const conditions: WhereOptions[] = [...before(query.cursor)];
      if (query.action) conditions.push({ action: query.action });
      if (query.targetType) conditions.push({ targetType: query.targetType });
      if (query.targetId) conditions.push({ targetId: query.targetId });
      if (query.adminId) conditions.push({ adminId: query.adminId });
      const rows = await AdminAuditLog.findAll({
        where: { [Op.and]: conditions },
        attributes: ['id', 'adminId', 'action', 'targetType', 'targetId', 'metadata', 'createdAt'],
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: limit + 1,
      });
      const page = rows.slice(0, limit);
      const admins = await AdminUser.findAll({
        where: { id: [...new Set(page.map((row) => row.adminId))] },
        attributes: ['id', 'name'],
      });
      const nameById = new Map(admins.map((admin) => [admin.id, admin.name]));
      return {
        items: page.map((row) => ({
          id: row.id,
          admin: { id: row.adminId, name: nameById.get(row.adminId) ?? null },
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          metadata: row.metadata,
          createdAt: row.createdAt.toISOString(),
        })),
        meta: { nextCursor: nextCursor(rows, limit) },
      };
    },
  };
}
