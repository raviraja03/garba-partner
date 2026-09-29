import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import {
  CONFIGURABLE_NOTIFICATION_TYPES,
  NOTIFICATION_TYPES,
  type AdminNotificationStatsDto,
} from '@garba-partner/shared';

interface TypeRow {
  type: string;
  last24h: number;
  last7d: number;
  read7d: number;
  unread: number;
}

export interface AdminNotificationsService {
  stats(): Promise<AdminNotificationStatsDto>;
}

/**
 * Notification monitoring (docs/notifications/notifications.md#7-admin-monitoring): aggregate
 * counts only. No member, message or notification content is ever returned.
 */
export function createAdminNotificationsService(deps: {
  sequelize: Sequelize;
}): AdminNotificationsService {
  const { sequelize } = deps;
  return {
    async stats() {
      const [byType, [totals], [optOuts]] = await Promise.all([
        sequelize.query<TypeRow>(
          `SELECT type,
                  count(*) FILTER (WHERE occurred_at > now() - interval '24 hours')::int AS "last24h",
                  count(*) FILTER (WHERE occurred_at > now() - interval '7 days')::int AS "last7d",
                  count(*) FILTER (WHERE occurred_at > now() - interval '7 days'
                                     AND read_at IS NOT NULL)::int AS "read7d",
                  count(*) FILTER (WHERE read_at IS NULL)::int AS unread
             FROM notifications
            GROUP BY type`,
          { type: QueryTypes.SELECT },
        ),
        sequelize.query<{ stored: number }>(`SELECT count(*)::int AS stored FROM notifications`, {
          type: QueryTypes.SELECT,
        }),
        sequelize.query<Record<string, number>>(
          `SELECT ${CONFIGURABLE_NOTIFICATION_TYPES.map(
            (type) => `count(*) FILTER (WHERE NOT ${type})::int AS ${type}`,
          ).join(', ')}
             FROM notification_preferences`,
          { type: QueryTypes.SELECT },
        ),
      ]);
      const rowByType = new Map(byType.map((row) => [row.type, row]));
      const items = NOTIFICATION_TYPES.map((type) => {
        const row = rowByType.get(type);
        const last7d = row?.last7d ?? 0;
        return {
          type,
          last24h: row?.last24h ?? 0,
          last7d,
          readRate7d: last7d > 0 ? Math.round(((row?.read7d ?? 0) / last7d) * 1000) / 1000 : null,
          unread: row?.unread ?? 0,
          optedOut: (CONFIGURABLE_NOTIFICATION_TYPES as readonly string[]).includes(type)
            ? (optOuts?.[type] ?? 0)
            : null,
        };
      });
      return {
        generatedAt: new Date().toISOString(),
        totals: {
          last24h: items.reduce((sum, item) => sum + item.last24h, 0),
          last7d: items.reduce((sum, item) => sum + item.last7d, 0),
          unread: items.reduce((sum, item) => sum + item.unread, 0),
          stored: totals?.stored ?? 0,
        },
        byType: items,
      };
    },
  };
}
