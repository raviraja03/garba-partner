import {
  Op,
  QueryTypes,
  type IncludeOptions,
  type Transaction,
  type WhereOptions,
} from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { Logger } from 'pino';
import {
  CONFIGURABLE_NOTIFICATION_TYPES,
  LIMITS,
  type ConfigurableNotificationType,
  type NotificationDto,
  type NotificationListQueryData,
  type NotificationPreferencesDto,
  type NotificationType,
  type PaginationMeta,
  type UpdateNotificationPreferencesInput,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { decodeCursor, encodeCursor } from '../../lib/pagination.js';
import {
  Event,
  Notification,
  NotificationPreference,
  User,
  UserProfile,
  type NotificationData,
} from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';
import type { RealtimeHub } from '../../realtime/hub.js';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  actorUserId?: string | null;
  matchId?: string | null;
  interestId?: string | null;
  eventId?: string | null;
  data?: NotificationData;
}

/**
 * Creates notifications. Called AFTER the triggering transaction commits; it never throws, so a
 * notification problem can never undo or fail the action that caused it.
 */
export interface Notifier {
  notify(input: NotifyInput): Promise<void>;
  /** Pushes already-stored notifications (e.g. created in bulk by the reminder job). */
  push(notificationIds: readonly string[]): Promise<void>;
}

export interface NotificationsService {
  list(
    userId: string,
    query: NotificationListQueryData,
  ): Promise<{ items: NotificationDto[]; meta: PaginationMeta }>;
  unreadCount(userId: string): Promise<number>;
  markRead(userId: string, notificationId: string): Promise<NotificationDto>;
  markAllRead(userId: string): Promise<{ updated: number }>;
  preferences(userId: string): Promise<NotificationPreferencesDto>;
  updatePreferences(
    userId: string,
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferencesDto>;
}

/** Preference column (model attribute) for each configurable type. */
const PREFERENCE_ATTRIBUTE = {
  interest_received: 'interestReceived',
  interest_accepted: 'interestAccepted',
  match_created: 'matchCreated',
  new_message: 'newMessage',
  verification_completed: 'verificationCompleted',
  event_reminder: 'eventReminder',
} as const satisfies Record<ConfigurableNotificationType, keyof NotificationPreference>;

const isConfigurable = (type: NotificationType): type is ConfigurableNotificationType =>
  (CONFIGURABLE_NOTIFICATION_TYPES as readonly string[]).includes(type);

/** Where each notification leads in the web app. */
function linkFor(n: Notification): string | null {
  switch (n.type) {
    case 'interest_received':
      return '/interests';
    case 'interest_accepted':
    case 'match_created':
      return n.matchId ? `/matches/${n.matchId}` : '/matches';
    case 'new_message':
      return n.matchId ? `/chats/${n.matchId}` : '/chats';
    case 'verification_completed':
      return '/profile';
    case 'event_reminder':
      return n.event ? `/events/${n.event.slug}` : '/events';
    case 'safety':
      return n.data.safetyKind === 'report_reviewed' ? '/safety' : '/guidelines';
  }
}

/**
 * Builds member-facing DTOs. The actor is shown only while their account is active (public name
 * and thumbnail only); nothing private is ever included (docs/notifications/notifications.md#4-privacy).
 */
export async function toNotificationDtos(
  rows: Notification[],
  media: MediaStorage,
): Promise<NotificationDto[]> {
  const actorIds = [...new Set(rows.flatMap((n) => (n.actorUserId ? [n.actorUserId] : [])))];
  const actors =
    actorIds.length === 0
      ? []
      : await User.findAll({
          where: { id: actorIds, status: 'active' },
          attributes: ['id'],
          include: [{ model: UserProfile, attributes: ['displayName', 'imagePublicId'] }],
        });
  const actorById = new Map(
    actors.flatMap((user) =>
      user.profile
        ? [
            [
              user.id,
              {
                id: user.id,
                name: user.profile.displayName,
                thumbnailUrl: user.profile.imagePublicId
                  ? media.url(user.profile.imagePublicId, 'thumbnail')
                  : null,
              },
            ] as const,
          ]
        : [],
    ),
  );
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    actor: n.actorUserId ? (actorById.get(n.actorUserId) ?? null) : null,
    link: linkFor(n),
    count: n.count,
    matchId: n.matchId,
    interestId: n.interestId,
    event: n.event
      ? {
          id: n.event.id,
          slug: n.event.slug,
          name: n.event.name,
          startsAt: n.event.startsAt.toISOString(),
        }
      : null,
    verification:
      n.type === 'verification_completed' && n.data.verificationType && n.data.outcome
        ? { type: n.data.verificationType, outcome: n.data.outcome }
        : null,
    safety: n.type === 'safety' && n.data.safetyKind ? { kind: n.data.safetyKind } : null,
    occurredAt: n.occurredAt.toISOString(),
    readAt: n.readAt?.toISOString() ?? null,
  }));
}

const eventInclude = (): IncludeOptions => ({
  model: Event,
  as: 'event',
  attributes: ['id', 'slug', 'name', 'startsAt'],
  required: false,
});

export async function countUnread(userId: string): Promise<number> {
  return Notification.count({ where: { userId, readAt: null } });
}

/**
 * Removes every notification between two members (both directions). Called in the same
 * transaction as a block or report, so the blocked person's name never shows up again.
 */
export async function removeNotificationsBetween(
  a: string,
  b: string,
  transaction: Transaction,
): Promise<void> {
  await Notification.destroy({
    where: {
      [Op.or]: [
        { userId: a, actorUserId: b },
        { userId: b, actorUserId: a },
      ],
    },
    transaction,
  });
}

/** Reading a chat also reads its "new message" notification. Returns true if one changed. */
export async function markChatNotificationsRead(userId: string, matchId: string): Promise<boolean> {
  const [changed] = await Notification.update(
    { readAt: new Date() },
    { where: { userId, matchId, type: 'new_message', readAt: null } },
  );
  return changed > 0;
}

async function isEnabled(userId: string, type: NotificationType): Promise<boolean> {
  if (!isConfigurable(type)) return true; // safety: always delivered
  const preference = await NotificationPreference.findByPk(userId, {
    attributes: [PREFERENCE_ATTRIBUTE[type]],
  });
  return preference ? preference[PREFERENCE_ATTRIBUTE[type]] : true;
}

/** See `Notifier`. Pushes `notification:new` (with the unread total) to the member's sockets. */
export function createNotifier(deps: {
  sequelize: Sequelize;
  media: MediaStorage;
  hub: RealtimeHub;
  logger: Logger;
}): Notifier {
  const { sequelize, media, hub, logger } = deps;

  async function push(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const rows = await Notification.findAll({ where: { id: [...ids] }, include: [eventInclude()] });
    const dtos = await toNotificationDtos(rows, media);
    const unreadByUser = new Map<string, number>();
    for (const [index, dto] of dtos.entries()) {
      const userId = rows[index]?.userId;
      if (!userId) continue;
      if (!unreadByUser.has(userId)) unreadByUser.set(userId, await countUnread(userId));
      hub.toUser(userId, 'notification:new', {
        notification: dto,
        unreadCount: unreadByUser.get(userId) ?? 0,
      });
    }
  }

  async function store(input: NotifyInput): Promise<string | null> {
    // Account must still be usable (no notifications pile up for banned or deleted members).
    const recipient = await User.findOne({
      where: { id: input.userId, status: ['active', 'suspended'] },
      attributes: ['id'],
    });
    if (!recipient) return null;
    if (!(await isEnabled(input.userId, input.type))) return null;

    if (input.type === 'new_message' && input.matchId) {
      // One unread notification per chat: later messages bump the count (atomic upsert).
      const rows = await sequelize.query<{ id: string }>(
        `INSERT INTO notifications (user_id, type, actor_user_id, match_id, data, count, occurred_at)
         VALUES (:userId, 'new_message', :actorUserId, :matchId, '{}'::jsonb, 1, now())
         ON CONFLICT (user_id, match_id) WHERE type = 'new_message' AND read_at IS NULL
         DO UPDATE SET count = notifications.count + 1,
                       occurred_at = now(),
                       actor_user_id = EXCLUDED.actor_user_id
         RETURNING id`,
        {
          type: QueryTypes.SELECT,
          replacements: {
            userId: input.userId,
            actorUserId: input.actorUserId ?? null,
            matchId: input.matchId,
          },
        },
      );
      return rows[0]?.id ?? null;
    }

    const created = await Notification.create({
      userId: input.userId,
      type: input.type,
      actorUserId: input.actorUserId ?? null,
      matchId: input.matchId ?? null,
      interestId: input.interestId ?? null,
      eventId: input.eventId ?? null,
      data: input.data ?? {},
    });
    return created.id;
  }

  return {
    async notify(input) {
      try {
        const id = await store(input);
        if (id) await push([id]);
      } catch (err) {
        // Never fails the action that triggered it. Logged with IDs only.
        logger.error({ err, type: input.type, userId: input.userId }, 'Notification failed');
      }
    },
    async push(ids) {
      try {
        await push(ids);
      } catch (err) {
        logger.error({ err }, 'Notification push failed');
      }
    },
  };
}

/** Member endpoints (docs/notifications/notifications.md#5-api). */
export function createNotificationsService(deps: { media: MediaStorage }): NotificationsService {
  const { media } = deps;

  async function load(userId: string, notificationId: string): Promise<Notification> {
    // Scoped to the owner: someone else's notification is indistinguishable from a missing one.
    const row = await Notification.findOne({
      where: { id: notificationId, userId },
      include: [eventInclude()],
    });
    if (!row) throw new AppError('NOT_FOUND', { message: 'Notification not found.' });
    return row;
  }

  async function preferences(userId: string): Promise<NotificationPreferencesDto> {
    const row = await NotificationPreference.findByPk(userId);
    const on = (type: ConfigurableNotificationType) =>
      row ? row[PREFERENCE_ATTRIBUTE[type]] : true;
    return {
      interest_received: on('interest_received'),
      interest_accepted: on('interest_accepted'),
      match_created: on('match_created'),
      new_message: on('new_message'),
      verification_completed: on('verification_completed'),
      event_reminder: on('event_reminder'),
    };
  }

  return {
    async list(userId, query) {
      const limit = query.limit ?? LIMITS.NOTIFICATIONS_PAGE_SIZE_DEFAULT;
      const conditions: WhereOptions[] = [{ userId }];
      if (query.unread === 'true') conditions.push({ readAt: null });
      if (query.cursor) {
        const cursor = decodeCursor(query.cursor);
        const at = new Date(cursor.createdAt);
        conditions.push({
          [Op.or]: [
            { occurredAt: { [Op.lt]: at } },
            { occurredAt: at, id: { [Op.lt]: cursor.id } },
          ],
        });
      }
      const rows = await Notification.findAll({
        where: { [Op.and]: conditions },
        include: [eventInclude()],
        order: [
          ['occurredAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: await toNotificationDtos(page, media),
        meta: {
          nextCursor:
            rows.length > limit && last
              ? encodeCursor({ createdAt: last.occurredAt.toISOString(), id: last.id })
              : null,
        },
      };
    },

    unreadCount: countUnread,

    async markRead(userId, notificationId) {
      const row = await load(userId, notificationId);
      if (!row.readAt) await row.update({ readAt: new Date() });
      const [dto] = await toNotificationDtos([row], media);
      if (!dto) throw new AppError('NOT_FOUND', { message: 'Notification not found.' });
      return dto;
    },

    async markAllRead(userId) {
      const [updated] = await Notification.update(
        { readAt: new Date() },
        { where: { userId, readAt: null } },
      );
      return { updated };
    },

    preferences,

    async updatePreferences(userId, input) {
      const values: Partial<
        Record<(typeof PREFERENCE_ATTRIBUTE)[ConfigurableNotificationType], boolean>
      > = {};
      for (const type of CONFIGURABLE_NOTIFICATION_TYPES) {
        const value = input[type];
        if (value !== undefined) values[PREFERENCE_ATTRIBUTE[type]] = value;
      }
      const [row] = await NotificationPreference.findOrCreate({
        where: { userId },
        defaults: { userId },
      });
      await row.update(values);
      return preferences(userId);
    },
  };
}
