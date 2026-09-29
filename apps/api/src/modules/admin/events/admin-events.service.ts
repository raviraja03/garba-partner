import { Op, type InferAttributes, type Transaction, type WhereOptions } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { Logger } from 'pino';
import type { ServerEnv } from '@garba-partner/config/server';
import {
  LIMITS,
  addDays,
  todayInIndia,
  type AdminEventDetailDto,
  type AdminEventListItemDto,
  type AdminEventListQueryData,
  type AdminEventSort,
  type CreateEventData,
  type PaginationMeta,
  type UpdateEventData,
} from '@garba-partner/shared';
import { AppError } from '../../../lib/app-error.js';
import { processProfileImage } from '../../../lib/image.js';
import {
  cursorAfter,
  decodeSortCursor,
  keysetCondition,
  keysetOrderBy,
  type KeysetOrder,
} from '../../../lib/pagination.js';
import { escapeLike } from '../../../lib/sql.js';
import { AdminUser, Area, City, Event, EventOrganizer } from '../../../models/index.js';
import type { MediaStorage } from '../../../providers/media/index.js';
import { createEventSlug } from '../../events/event-slug.js';
import {
  toAdminEventDetailDto,
  toAdminEventListItemDto,
  toHhMm,
} from '../../events/event.mapper.js';
import { istStartOfDay } from '../../events/events.service.js';
import { assertValidLocation } from '../../locations/locations.service.js';
import { loadAdminEventPass, seatCounts } from '../../payments/pass-availability.js';
import { recordAdminAction } from '../audit/audit.service.js';
import type { AdminActor } from '../users/admin-users.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ADMIN_ORDERS: Record<AdminEventSort, KeysetOrder> = {
  date_asc: { attribute: 'startsAt', direction: 'ASC', kind: 'date' },
  date_desc: { attribute: 'startsAt', direction: 'DESC', kind: 'date' },
  created_desc: { attribute: 'createdAt', direction: 'DESC', kind: 'date' },
  name_asc: { attribute: 'name', direction: 'ASC', kind: 'string' },
};

/**
 * Changes that affect where, when or how members attend (or buy passes). If an event was
 * verified, any of these clears the badge until an admin verifies it again.
 */
const MATERIAL_FIELDS = [
  'organizerId',
  'cityId',
  'areaId',
  'venueName',
  'venueAddress',
  'eventDate',
  'startTime',
  'endTime',
  'ticketUrl',
] as const;

type EditableField = keyof UpdateEventData;
type EventChanges = Partial<Record<EditableField, string | null>>;

export interface AdminEventsService {
  list(
    query: AdminEventListQueryData,
  ): Promise<{ items: AdminEventListItemDto[]; meta: PaginationMeta }>;
  get(eventId: string): Promise<AdminEventDetailDto>;
  create(actor: AdminActor, input: CreateEventData): Promise<AdminEventDetailDto>;
  update(actor: AdminActor, eventId: string, input: UpdateEventData): Promise<AdminEventDetailDto>;
  uploadImage(actor: AdminActor, eventId: string, file: Buffer): Promise<AdminEventDetailDto>;
  deleteImage(actor: AdminActor, eventId: string): Promise<AdminEventDetailDto>;
  publish(actor: AdminActor, eventId: string): Promise<AdminEventDetailDto>;
  unpublish(actor: AdminActor, eventId: string): Promise<AdminEventDetailDto>;
  verify(actor: AdminActor, eventId: string): Promise<AdminEventDetailDto>;
  unverify(actor: AdminActor, eventId: string): Promise<AdminEventDetailDto>;
  archive(actor: AdminActor, eventId: string): Promise<AdminEventDetailDto>;
  restore(actor: AdminActor, eventId: string): Promise<AdminEventDetailDto>;
  /** Hard delete: only for events that were never published. */
  remove(actor: AdminActor, eventId: string): Promise<void>;
  /** Online pass price and capacity (docs/payments/payment-flow.md). Audited. */
  updatePass(
    actor: AdminActor,
    eventId: string,
    input: { pricePaise: number | null; capacity: number | null },
  ): Promise<AdminEventDetailDto>;
}

const notFound = () => new AppError('NOT_FOUND', { message: 'Event not found.' });
const conflict = (message: string) => new AppError('CONFLICT', { message });
const invalid = (path: string, message: string) =>
  new AppError('VALIDATION_ERROR', { details: [{ path, message }] });

/** The event date must be today or later (IST) and within the scheduling horizon. */
function assertSchedule(eventDate: string, startTime: string, endTime: string): void {
  const today = todayInIndia();
  if (eventDate < today) throw invalid('eventDate', 'The event date cannot be in the past.');
  if (eventDate > addDays(today, LIMITS.EVENT_MAX_DAYS_AHEAD)) {
    throw invalid('eventDate', 'Events can be scheduled at most two years ahead.');
  }
  if (toHhMm(startTime) === toHhMm(endTime)) {
    throw invalid('endTime', 'End time must differ from start time.');
  }
}

/** Only active organizers can be attached to events. */
async function assertUsableOrganizer(organizerId: string, transaction: Transaction) {
  const organizer = await EventOrganizer.findOne({
    where: { id: organizerId, status: 'active' },
    attributes: ['id'],
    transaction,
  });
  if (!organizer) throw invalid('organizerId', 'Choose an active organizer.');
}

async function uniqueSlug(name: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = createEventSlug(name);
    if ((await Event.count({ where: { slug } })) === 0) return slug;
  }
  throw new Error('Could not generate a unique event slug');
}

/** Event management for admins (docs/events/event-management.md). Every write is audited. */
export function createAdminEventsService(deps: {
  sequelize: Sequelize;
  env: ServerEnv;
  media: MediaStorage;
  logger: Logger;
}): AdminEventsService {
  const { sequelize, env, media, logger } = deps;

  async function getDetail(eventId: string): Promise<AdminEventDetailDto> {
    const event = await Event.findByPk(eventId, {
      include: [
        { model: City, attributes: ['id', 'name'] },
        { model: Area, attributes: ['id', 'name'] },
        { model: EventOrganizer, attributes: ['id', 'name', 'isVerified'] },
        { model: AdminUser, as: 'createdBy', attributes: ['id', 'name'] },
        { model: AdminUser, as: 'updatedBy', attributes: ['id', 'name'] },
      ],
    });
    if (!event) throw notFound();
    return toAdminEventDetailDto(
      event,
      media,
      new Date(),
      await loadAdminEventPass(sequelize, event),
    );
  }

  function audit(
    actor: AdminActor,
    action: string,
    eventId: string,
    metadata: Record<string, unknown>,
    transaction: Transaction,
  ) {
    return recordAdminAction(
      {
        adminId: actor.adminId,
        action,
        targetType: 'event',
        targetId: eventId,
        metadata,
        ip: actor.ip,
      },
      env.OTP_HMAC_SECRET,
      transaction,
    );
  }

  async function destroyQuietly(publicId: string, reason: string): Promise<void> {
    try {
      await media.destroy(publicId);
    } catch (err) {
      logger.error({ err, publicId, reason }, 'Failed to delete stored event image');
    }
  }

  /** Locks the event, applies a state change and audits it, all in one transaction. */
  async function transition(
    actor: AdminActor,
    eventId: string,
    action: string,
    apply: (event: Event, transaction: Transaction) => Promise<Partial<Event>> | Partial<Event>,
  ): Promise<AdminEventDetailDto> {
    await sequelize.transaction(async (transaction) => {
      const event = await Event.findByPk(eventId, { lock: transaction.LOCK.UPDATE, transaction });
      if (!event) throw notFound();
      const from = event.status;
      const changes = await apply(event, transaction);
      await event.update({ ...changes, updatedByAdminId: actor.adminId }, { transaction });
      await audit(actor, action, eventId, { from, to: event.status }, transaction);
    });
    return getDetail(eventId);
  }

  /** Locks an event that may be edited (not archived). */
  async function lockEditable(eventId: string, transaction: Transaction): Promise<Event> {
    const event = await Event.findByPk(eventId, { lock: transaction.LOCK.UPDATE, transaction });
    if (!event) throw notFound();
    if (event.status === 'archived') throw conflict('Restore this event before editing it.');
    return event;
  }

  return {
    async updatePass(actor, eventId, input) {
      await sequelize.transaction(async (transaction) => {
        // Same lock as order creation, so capacity can't change under a checkout.
        const event = await lockEditable(eventId, transaction);
        const { sold, reserved } = await seatCounts(sequelize, event.id, { transaction });
        if (input.capacity !== null && input.capacity < sold + reserved) {
          throw invalid(
            'capacity',
            `Capacity can't be lower than the ${String(sold + reserved)} passes already sold or reserved.`,
          );
        }
        const before = { pricePaise: event.passPricePaise, capacity: event.passCapacity };
        await event.update(
          {
            passPricePaise: input.pricePaise,
            passCapacity: input.capacity,
            updatedByAdminId: actor.adminId,
          },
          { transaction },
        );
        await audit(
          actor,
          'event.pass_update',
          event.id,
          { before, after: input, sold },
          transaction,
        );
      });
      return getDetail(eventId);
    },

    async list(query) {
      const sort = query.sort ?? 'created_desc';
      const order = ADMIN_ORDERS[sort];
      const limit = Math.min(
        Math.max(query.limit ?? LIMITS.ADMIN_PAGE_SIZE_DEFAULT, 1),
        LIMITS.ADMIN_PAGE_SIZE_MAX,
      );

      const conditions: WhereOptions[] = [];
      if (query.status) conditions.push({ status: query.status });
      if (query.cityId) conditions.push({ cityId: query.cityId });
      if (query.organizerId) conditions.push({ organizerId: query.organizerId });
      if (query.verified !== undefined) conditions.push({ isVerified: query.verified });
      if (query.from) conditions.push({ startsAt: { [Op.gte]: istStartOfDay(query.from) } });
      if (query.to) {
        conditions.push({ startsAt: { [Op.lt]: istStartOfDay(addDays(query.to, 1)) } });
      }
      if (query.q) {
        conditions.push(
          UUID_PATTERN.test(query.q)
            ? { id: query.q }
            : {
                [Op.or]: [
                  { name: { [Op.iLike]: `%${escapeLike(query.q)}%` } },
                  { slug: query.q.toLowerCase() },
                ],
              },
        );
      }
      if (query.cursor) {
        conditions.push(keysetCondition(order, decodeSortCursor(query.cursor, sort, order)));
      }

      const rows = await Event.findAll({
        where: { [Op.and]: conditions },
        attributes: { exclude: ['description'] },
        include: [
          { model: City, attributes: ['id', 'name'] },
          { model: EventOrganizer, attributes: ['id', 'name', 'isVerified'] },
        ],
        order: keysetOrderBy(order),
        limit: limit + 1,
        subQuery: false,
      });

      const now = new Date();
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const lastValue = last ? (last.get(order.attribute) as Date | string) : null;
      return {
        items: page.map((event) => toAdminEventListItemDto(event, media, now)),
        meta: {
          nextCursor:
            rows.length > limit && last && lastValue !== null
              ? cursorAfter(sort, lastValue, last.id)
              : null,
        },
      };
    },

    get: getDetail,

    async create(actor, input) {
      assertSchedule(input.eventDate, input.startTime, input.endTime);
      const slug = await uniqueSlug(input.name);
      const eventId = await sequelize.transaction(async (transaction) => {
        const areaId = input.areaId ?? null;
        await assertValidLocation(input.cityId, areaId, transaction);
        await assertUsableOrganizer(input.organizerId, transaction);
        const event = await Event.create(
          {
            slug,
            name: input.name,
            description: input.description,
            organizerId: input.organizerId,
            cityId: input.cityId,
            areaId,
            venueName: input.venueName,
            venueAddress: input.venueAddress,
            eventDate: input.eventDate,
            startTime: input.startTime,
            endTime: input.endTime,
            ticketUrl: input.ticketUrl ?? null,
            createdByAdminId: actor.adminId,
            updatedByAdminId: actor.adminId,
          },
          { transaction },
        );
        await audit(actor, 'event.create', event.id, { name: input.name }, transaction);
        return event.id;
      });
      return getDetail(eventId);
    },

    async update(actor, eventId, input) {
      await sequelize.transaction(async (transaction) => {
        const event = await lockEditable(eventId, transaction);

        const changes: EventChanges = {};
        for (const [key, value] of Object.entries(input) as [
          EditableField,
          string | null | undefined,
        ][]) {
          if (value === undefined) continue;
          const current = event.get(key);
          const same =
            key === 'startTime' || key === 'endTime'
              ? current !== null && value !== null && toHhMm(current) === toHhMm(value)
              : current === value;
          if (!same) changes[key] = value;
        }
        // A new city invalidates the old area unless a new area is given.
        if (changes.cityId !== undefined && input.areaId === undefined) changes.areaId = null;

        const fields = Object.keys(changes) as EditableField[];
        if (fields.length === 0) return;

        if (changes.cityId !== undefined || changes.areaId !== undefined) {
          await assertValidLocation(
            changes.cityId ?? event.cityId,
            changes.areaId !== undefined ? changes.areaId : event.areaId,
            transaction,
          );
        }
        if (changes.organizerId) await assertUsableOrganizer(changes.organizerId, transaction);
        if (
          changes.eventDate !== undefined ||
          changes.startTime !== undefined ||
          changes.endTime !== undefined
        ) {
          assertSchedule(
            changes.eventDate ?? event.eventDate,
            changes.startTime ?? event.startTime,
            changes.endTime ?? event.endTime,
          );
        }

        const verificationReset =
          event.isVerified && MATERIAL_FIELDS.some((field) => fields.includes(field));
        await event.update(
          {
            // Keys and value types come from the validated update schema.
            ...(changes as Partial<InferAttributes<Event>>),
            ...(verificationReset ? { isVerified: false, verifiedAt: null } : {}),
            updatedByAdminId: actor.adminId,
          },
          { transaction },
        );
        await audit(actor, 'event.update', eventId, { fields, verificationReset }, transaction);
      });
      return getDetail(eventId);
    },

    async uploadImage(actor, eventId, file) {
      const existing = await Event.findByPk(eventId, { attributes: ['id', 'status'] });
      if (!existing) throw notFound();
      if (existing.status === 'archived') throw conflict('Restore this event before editing it.');

      // Decoded, verified, EXIF (incl. GPS) stripped and re-encoded before storage.
      const processed = await processProfileImage(file);
      const stored = await media.upload(processed, 'event-images');

      let previous: string | null;
      try {
        previous = await sequelize.transaction(async (transaction) => {
          const event = await lockEditable(eventId, transaction);
          const old = event.imagePublicId;
          await event.update(
            { imagePublicId: stored.publicId, updatedByAdminId: actor.adminId },
            { transaction },
          );
          await audit(actor, 'event.image_update', eventId, {}, transaction);
          return old;
        });
      } catch (error) {
        await destroyQuietly(stored.publicId, 'rollback');
        throw error;
      }
      if (previous) await destroyQuietly(previous, 'replaced');
      return getDetail(eventId);
    },

    async deleteImage(actor, eventId) {
      const previous = await sequelize.transaction(async (transaction) => {
        const event = await lockEditable(eventId, transaction);
        const old = event.imagePublicId;
        if (!old) return null;
        await event.update(
          { imagePublicId: null, updatedByAdminId: actor.adminId },
          { transaction },
        );
        await audit(actor, 'event.image_delete', eventId, {}, transaction);
        return old;
      });
      if (previous) await destroyQuietly(previous, 'deleted');
      return getDetail(eventId);
    },

    publish: (actor, eventId) =>
      transition(actor, eventId, 'event.publish', async (event, transaction) => {
        if (event.status === 'published') throw conflict('This event is already published.');
        if (event.status === 'archived') throw conflict('Restore this event before publishing it.');
        const now = new Date();
        if (event.endsAt <= now) throw conflict('This event has already ended.');
        const [organizer, city] = await Promise.all([
          EventOrganizer.findByPk(event.organizerId, { attributes: ['status'], transaction }),
          City.findByPk(event.cityId, { attributes: ['isActive'], transaction }),
        ]);
        if (organizer?.status !== 'active') {
          throw conflict("The event's organizer is archived. Choose an active organizer first.");
        }
        if (!city?.isActive) throw conflict("The event's city is not active.");
        return {
          status: 'published',
          publishedAt: now,
          firstPublishedAt: event.firstPublishedAt ?? now,
        };
      }),

    unpublish: (actor, eventId) =>
      transition(actor, eventId, 'event.unpublish', (event) => {
        if (event.status !== 'published') throw conflict('This event is not published.');
        return { status: 'draft', publishedAt: null };
      }),

    verify: (actor, eventId) =>
      transition(actor, eventId, 'event.verify', (event) => {
        if (event.status === 'archived') throw conflict('Archived events cannot be verified.');
        if (event.isVerified) throw conflict('This event is already verified.');
        return { isVerified: true, verifiedAt: new Date() };
      }),

    unverify: (actor, eventId) =>
      transition(actor, eventId, 'event.unverify', (event) => {
        if (!event.isVerified) throw conflict('This event is not verified.');
        return { isVerified: false, verifiedAt: null };
      }),

    archive: (actor, eventId) =>
      transition(actor, eventId, 'event.archive', (event) => {
        if (event.status === 'archived') throw conflict('This event is already archived.');
        return { status: 'archived', archivedAt: new Date(), publishedAt: null };
      }),

    restore: (actor, eventId) =>
      transition(actor, eventId, 'event.restore', (event) => {
        if (event.status !== 'archived') throw conflict('This event is not archived.');
        // Restored events come back as drafts and must be published again deliberately.
        return { status: 'draft', archivedAt: null };
      }),

    async remove(actor, eventId) {
      const imagePublicId = await sequelize.transaction(async (transaction) => {
        const event = await Event.findByPk(eventId, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!event) throw notFound();
        if (event.firstPublishedAt !== null) {
          throw conflict('Events that have been published cannot be deleted. Archive it instead.');
        }
        const image = event.imagePublicId;
        await event.destroy({ transaction });
        await audit(actor, 'event.delete', eventId, { name: event.name }, transaction);
        return image;
      });
      if (imagePublicId) await destroyQuietly(imagePublicId, 'event_deleted');
    },
  };
}
