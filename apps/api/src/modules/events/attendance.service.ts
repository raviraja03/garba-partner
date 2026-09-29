import { Op } from 'sequelize';
import type {
  MyAttendanceDto,
  MyEventAttendanceDto,
  SetAttendanceData,
} from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { City, Event, EventAttendance } from '../../models/index.js';
import { toHhMm } from './event.mapper.js';

export interface AttendanceService {
  get(userId: string, eventId: string): Promise<MyAttendanceDto | null>;
  set(userId: string, eventId: string, input: SetAttendanceData): Promise<MyAttendanceDto>;
  clear(userId: string, eventId: string): Promise<void>;
  /** The member's attendance at upcoming published events, soonest first. */
  listMine(userId: string): Promise<MyEventAttendanceDto[]>;
}

const toDto = (attendance: EventAttendance): MyAttendanceDto => ({
  eventId: attendance.eventId,
  status: attendance.status,
  lookingForPartner: attendance.lookingForPartner,
  updatedAt: attendance.updatedAt.toISOString(),
});

/** Attendance can change only on published events that have not ended. */
async function assertOpen(eventId: string): Promise<void> {
  const event = await Event.findOne({
    where: { id: eventId, status: 'published' },
    attributes: ['id', 'endsAt'],
  });
  if (!event) throw new AppError('NOT_FOUND', { message: 'Event not found.' });
  if (event.endsAt <= new Date()) throw new AppError('EVENT_NOT_OPEN');
}

/**
 * Event attendance (docs/matching/discovery.md#event-attendance). Private to the member: the
 * only way another member learns about it is reciprocal event-mode discovery.
 */
export function createAttendanceService(): AttendanceService {
  return {
    async get(userId, eventId) {
      const attendance = await EventAttendance.findOne({ where: { userId, eventId } });
      return attendance ? toDto(attendance) : null;
    },

    async set(userId, eventId, input) {
      await assertOpen(eventId);
      const [attendance, created] = await EventAttendance.findOrCreate({
        where: { userId, eventId },
        defaults: { userId, eventId, ...input },
      });
      if (!created) await attendance.update(input);
      return toDto(attendance);
    },

    async clear(userId, eventId) {
      await assertOpen(eventId);
      await EventAttendance.destroy({ where: { userId, eventId } });
    },

    async listMine(userId) {
      const rows = await EventAttendance.findAll({
        where: { userId },
        include: [
          {
            model: Event,
            required: true,
            where: { status: 'published', endsAt: { [Op.gt]: new Date() } },
            attributes: ['id', 'slug', 'name', 'eventDate', 'startTime', 'startsAt'],
            include: [{ model: City, attributes: ['id', 'name'] }],
          },
        ],
        order: [[{ model: Event, as: 'event' }, 'startsAt', 'ASC']],
      });
      return rows.flatMap((row) => {
        const event = row.event;
        if (!event?.city) return [];
        return [
          {
            ...toDto(row),
            event: {
              id: event.id,
              slug: event.slug,
              name: event.name,
              eventDate: event.eventDate,
              startTime: toHhMm(event.startTime),
              city: { id: event.city.id, name: event.city.name },
            },
          },
        ];
      });
    },
  };
}
