import { Op, type WhereOptions } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import {
  LIMITS,
  addDays,
  type EventCardDto,
  type EventDetailDto,
  type EventListQueryData,
  type EventSort,
  type PaginationMeta,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import {
  cursorAfter,
  decodeSortCursor,
  keysetCondition,
  keysetOrderBy,
  type KeysetOrder,
} from '../../lib/pagination.js';
import {
  Area,
  City,
  Event,
  EventOrganizer,
  ORGANIZER_PUBLIC_ATTRIBUTES,
} from '../../models/index.js';
import type { MediaStorage } from '../../providers/media/index.js';
import { loadEventPass } from '../payments/pass-availability.js';
import { toEventCardDto, toEventDetailDto } from './event.mapper.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUBLIC_ORDERS: Record<EventSort, KeysetOrder> = {
  date_asc: { attribute: 'startsAt', direction: 'ASC', kind: 'date' },
  date_desc: { attribute: 'startsAt', direction: 'DESC', kind: 'date' },
};

/** Start of an IST calendar day as an instant. */
export function istStartOfDay(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+05:30`);
}

/**
 * Public include list: only public organizer columns are ever loaded, so private contact details
 * cannot leak through a mapper mistake. Events in deactivated cities are hidden.
 */
const PUBLIC_INCLUDE = [
  { model: City, required: true, where: { isActive: true }, attributes: ['id', 'name'] },
  { model: Area, required: false, attributes: ['id', 'name'] },
  { model: EventOrganizer, required: true, attributes: [...ORGANIZER_PUBLIC_ATTRIBUTES] },
];

export interface EventsService {
  list(query: EventListQueryData): Promise<{ items: EventCardDto[]; meta: PaginationMeta }>;
  get(idOrSlug: string): Promise<EventDetailDto>;
}

/** Public event browsing (docs/events/event-api.md#public-endpoints). */
export function createEventsService(deps: {
  sequelize: Sequelize;
  media: MediaStorage;
}): EventsService {
  const { sequelize, media } = deps;

  return {
    async list(query) {
      const sort = query.sort ?? 'date_asc';
      const order = PUBLIC_ORDERS[sort];
      const limit = Math.min(
        Math.max(query.limit ?? LIMITS.EVENT_PAGE_SIZE_DEFAULT, 1),
        LIMITS.EVENT_PAGE_SIZE_MAX,
      );
      const now = new Date();

      // Published and not yet ended (ongoing events stay listed until they end).
      const conditions: WhereOptions[] = [{ status: 'published' }, { endsAt: { [Op.gt]: now } }];
      if (query.cityId) conditions.push({ cityId: query.cityId });
      if (query.from) conditions.push({ startsAt: { [Op.gte]: istStartOfDay(query.from) } });
      if (query.to) {
        conditions.push({ startsAt: { [Op.lt]: istStartOfDay(addDays(query.to, 1)) } });
      }
      if (query.cursor) {
        conditions.push(keysetCondition(order, decodeSortCursor(query.cursor, sort, order)));
      }

      const rows = await Event.findAll({
        where: { [Op.and]: conditions },
        attributes: [
          'id',
          'slug',
          'name',
          'cityId',
          'areaId',
          'organizerId',
          'venueName',
          'eventDate',
          'startTime',
          'endTime',
          'startsAt',
          'endsAt',
          'imagePublicId',
          'ticketUrl',
          'isVerified',
        ],
        include: PUBLIC_INCLUDE,
        order: keysetOrderBy(order),
        limit: limit + 1,
        subQuery: false,
      });

      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((event) => toEventCardDto(event, media, now)),
        meta: {
          nextCursor:
            rows.length > limit && last ? cursorAfter(sort, last.startsAt, last.id) : null,
        },
      };
    },

    async get(idOrSlug) {
      const event = await Event.findOne({
        where: {
          ...(UUID_PATTERN.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }),
          status: 'published',
        },
        attributes: { exclude: ['createdByAdminId', 'updatedByAdminId'] },
        include: PUBLIC_INCLUDE,
      });
      // Drafts, archived events and unknown IDs are indistinguishable: 404.
      if (!event) throw new AppError('NOT_FOUND', { message: 'Event not found.' });
      const now = new Date();
      return toEventDetailDto(event, media, now, await loadEventPass(sequelize, event, now));
    },
  };
}
