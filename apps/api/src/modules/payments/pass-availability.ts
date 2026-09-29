import { QueryTypes, type Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { LIMITS, type AdminEventPassDto, type EventPassDto } from '@garba-partner/shared';
import type { Event } from '../../models/index.js';

interface SeatRow {
  sold: number;
  reserved: number;
}

/**
 * Passes in confirmed bookings (`sold`) and in unpaid orders that still hold a reservation
 * (`reserved`). Pass `excludeOrderId` to leave one order out (it is being finalized).
 * Callers that decide on capacity must hold the event row lock (`FOR UPDATE`).
 */
export async function seatCounts(
  sequelize: Sequelize,
  eventId: string,
  options: { now?: Date; excludeOrderId?: string; transaction?: Transaction } = {},
): Promise<SeatRow> {
  const [row] = await sequelize.query<SeatRow>(
    `SELECT
       (SELECT COALESCE(SUM(quantity), 0)::int FROM event_bookings
         WHERE event_id = :eventId AND status = 'confirmed') AS sold,
       (SELECT COALESCE(SUM(quantity), 0)::int FROM orders
         WHERE event_id = :eventId AND status = 'created' AND expires_at > :now
           AND id <> :excludeOrderId) AS reserved`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        eventId,
        now: options.now ?? new Date(),
        // A UUID that never matches when nothing is excluded.
        excludeOrderId: options.excludeOrderId ?? '00000000-0000-0000-0000-000000000000',
      },
      ...(options.transaction ? { transaction: options.transaction } : {}),
    },
  );
  return row ?? { sold: 0, reserved: 0 };
}

/** Sales close when the event starts; archived or draft events never sell. */
export function passesOnSale(event: Event, now: Date): boolean {
  return event.passPricePaise !== null && event.status === 'published' && event.startsAt > now;
}

/** Public pass information for an event page (null when passes aren't sold here). */
export async function loadEventPass(
  sequelize: Sequelize,
  event: Event,
  now: Date = new Date(),
): Promise<EventPassDto | null> {
  if (event.passPricePaise === null) return null;
  const onSale = passesOnSale(event, now);
  let remaining: number | null = null;
  if (event.passCapacity !== null) {
    const { sold, reserved } = await seatCounts(sequelize, event.id, { now });
    remaining = Math.max(0, event.passCapacity - sold - reserved);
  }
  return {
    pricePaise: event.passPricePaise,
    currency: 'INR',
    maxPerOrder: LIMITS.PASS_MAX_PER_ORDER,
    onSale,
    remaining,
    soldOut: remaining === 0,
  };
}

/** Pass settings and sales for the admin event page. */
export async function loadAdminEventPass(
  sequelize: Sequelize,
  event: Event,
): Promise<AdminEventPassDto> {
  const { sold, reserved } = await seatCounts(sequelize, event.id);
  return { pricePaise: event.passPricePaise, capacity: event.passCapacity, sold, reserved };
}
