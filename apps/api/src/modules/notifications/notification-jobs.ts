import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { Logger } from 'pino';
import { LIMITS } from '@garba-partner/shared';
import type { Notifier } from './notifications.service.js';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Creates `event_reminder` notifications for members going to (or interested in) a published
 * event that starts within `LIMITS.EVENT_REMINDER_HOURS_BEFORE`. Idempotent: the unique index
 * allows one reminder per member and event, so reruns and parallel processes add nothing.
 * Respects preferences and skips suspended, banned and deleted accounts. Returns the new IDs.
 */
export async function createEventReminders(
  sequelize: Sequelize,
  now: Date = new Date(),
): Promise<string[]> {
  const rows = await sequelize.query<{ id: string }>(
    `INSERT INTO notifications (user_id, type, event_id, occurred_at)
     SELECT a.user_id, 'event_reminder', e.id, :now
       FROM event_attendances a
       JOIN events e ON e.id = a.event_id
       JOIN users u ON u.id = a.user_id
       LEFT JOIN notification_preferences p ON p.user_id = a.user_id
      WHERE e.status = 'published'
        AND e.starts_at > :now
        AND e.starts_at <= CAST(:now AS timestamptz) + make_interval(hours => :hours)
        AND u.status = 'active' AND u.deleted_at IS NULL
        AND COALESCE(p.event_reminder, true)
     ON CONFLICT (user_id, event_id) WHERE type = 'event_reminder' DO NOTHING
     RETURNING id`,
    {
      type: QueryTypes.SELECT,
      replacements: { now, hours: LIMITS.EVENT_REMINDER_HOURS_BEFORE },
    },
  );
  return rows.map((row) => row.id);
}

/** Deletes notifications older than `LIMITS.NOTIFICATION_RETENTION_DAYS`. Returns the count. */
export async function purgeOldNotifications(
  sequelize: Sequelize,
  now: Date = new Date(),
): Promise<number> {
  const [, result] = await sequelize.query(
    `DELETE FROM notifications
      WHERE occurred_at < CAST(:now AS timestamptz) - make_interval(days => :days)`,
    { replacements: { now, days: LIMITS.NOTIFICATION_RETENTION_DAYS } },
  );
  return (result as { rowCount?: number } | undefined)?.rowCount ?? 0;
}

/**
 * Runs reminders and retention every 15 minutes (started by `server.ts`). Returns a stop
 * function. New reminders are pushed to open sockets.
 */
export function startNotificationJobs(deps: {
  sequelize: Sequelize;
  notifier: Notifier;
  logger: Logger;
  intervalMs?: number;
}): () => void {
  const { sequelize, notifier, logger } = deps;
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const reminders = await createEventReminders(sequelize);
      await notifier.push(reminders);
      const purged = await purgeOldNotifications(sequelize);
      if (reminders.length > 0 || purged > 0) {
        logger.info({ reminders: reminders.length, purged }, 'Notification jobs ran');
      }
    } catch (err) {
      logger.error({ err }, 'Notification jobs failed');
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => void tick(), deps.intervalMs ?? DEFAULT_INTERVAL_MS);
  timer.unref();
  void tick();
  return () => {
    clearInterval(timer);
  };
}
