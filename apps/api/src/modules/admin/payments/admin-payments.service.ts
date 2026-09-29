import { Op, type WhereOptions } from 'sequelize';
import {
  LIMITS,
  type AdminBookingDto,
  type AdminBookingListQueryData,
  type AdminOrderDto,
  type AdminOrderListQueryData,
  type PaginationMeta,
} from '@garba-partner/shared';
import { AppError } from '../../../lib/app-error.js';
import { decodeCursor, encodeCursor } from '../../../lib/pagination.js';
import { Event, EventBooking, Order, Payment, UserProfile } from '../../../models/index.js';
import { toAdminPaymentDto, toBookingDto, toOrderDto } from '../../payments/payment.mapper.js';
import type { PaymentActor, PaymentsService } from '../../payments/payments.service.js';

export interface AdminPaymentsService {
  orders(query: AdminOrderListQueryData): Promise<{ items: AdminOrderDto[]; meta: PaginationMeta }>;
  order(orderId: string): Promise<AdminOrderDto>;
  bookings(
    query: AdminBookingListQueryData,
  ): Promise<{ items: AdminBookingDto[]; meta: PaginationMeta }>;
  booking(bookingId: string): Promise<AdminBookingDto>;
  refund(actor: PaymentActor, bookingId: string, reason: string): Promise<AdminBookingDto>;
}

function page<T extends { createdAt: Date; id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null,
  };
}

function before(cursor: string | undefined): WhereOptions[] {
  if (!cursor) return [];
  const c = decodeCursor(cursor);
  const at = new Date(c.createdAt);
  return [{ [Op.or]: [{ createdAt: { [Op.lt]: at } }, { createdAt: at, id: { [Op.lt]: c.id } }] }];
}

async function names(userIds: string[]): Promise<Map<string, string>> {
  const profiles = await UserProfile.findAll({
    where: { userId: [...new Set(userIds)] },
    attributes: ['userId', 'displayName'],
  });
  return new Map(profiles.map((p) => [p.userId, p.displayName]));
}

/**
 * Payments back office (docs/payments/refunds.md). `payments:view` for lists (super admins and
 * event managers); refunds need `payments:refund` (super admins). Shows display names and
 * Razorpay IDs only: never phone numbers, card or UPI details.
 */
export function createAdminPaymentsService(deps: {
  payments: PaymentsService;
}): AdminPaymentsService {
  async function toAdminOrders(orders: Order[]): Promise<AdminOrderDto[]> {
    const ids = orders.map((o) => o.id);
    const [payments, bookings, nameById] = await Promise.all([
      Payment.findAll({ where: { orderId: ids }, order: [['createdAt', 'DESC']] }),
      EventBooking.findAll({ where: { orderId: ids }, attributes: ['id', 'orderId'] }),
      names(orders.map((o) => o.userId)),
    ]);
    return orders.map((order) => {
      const own = payments.filter((p) => p.orderId === order.id);
      return {
        ...toOrderDto(order, {
          lastFailed: own.find((p) => p.status === 'failed') ?? null,
          bookingId: bookings.find((b) => b.orderId === order.id)?.id ?? null,
        }),
        user: { id: order.userId, name: nameById.get(order.userId) ?? null },
        razorpayOrderId: order.razorpayOrderId,
        payments: own.map(toAdminPaymentDto),
      };
    });
  }

  async function toAdminBookings(bookings: EventBooking[]): Promise<AdminBookingDto[]> {
    const [payments, nameById] = await Promise.all([
      Payment.findAll({ where: { id: bookings.map((b) => b.paymentId) } }),
      names(bookings.map((b) => b.userId)),
    ]);
    return bookings.map((booking) => {
      const payment = payments.find((p) => p.id === booking.paymentId);
      return {
        ...toBookingDto(booking),
        user: { id: booking.userId, name: nameById.get(booking.userId) ?? null },
        orderId: booking.orderId,
        payment: payment ? toAdminPaymentDto(payment) : null,
      };
    });
  }

  async function booking(bookingId: string): Promise<AdminBookingDto> {
    const row = await EventBooking.findByPk(bookingId, {
      include: [{ model: Event, as: 'event' }],
    });
    if (!row) throw new AppError('NOT_FOUND', { message: 'Booking not found.' });
    const [dto] = await toAdminBookings([row]);
    if (!dto) throw new AppError('NOT_FOUND', { message: 'Booking not found.' });
    return dto;
  }

  return {
    async orders(query) {
      const limit = query.limit ?? LIMITS.ADMIN_PAGE_SIZE_DEFAULT;
      const conditions: WhereOptions[] = before(query.cursor);
      if (query.status) conditions.push({ status: query.status });
      if (query.eventId) conditions.push({ eventId: query.eventId });
      const rows = await Order.findAll({
        where: { [Op.and]: conditions },
        include: [{ model: Event, as: 'event' }],
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: limit + 1,
      });
      const result = page(rows, limit);
      return { items: await toAdminOrders(result.items), meta: { nextCursor: result.nextCursor } };
    },

    async order(orderId) {
      const row = await Order.findByPk(orderId, { include: [{ model: Event, as: 'event' }] });
      if (!row) throw new AppError('NOT_FOUND', { message: 'Order not found.' });
      const [dto] = await toAdminOrders([row]);
      if (!dto) throw new AppError('NOT_FOUND', { message: 'Order not found.' });
      return dto;
    },

    async bookings(query) {
      const limit = query.limit ?? LIMITS.ADMIN_PAGE_SIZE_DEFAULT;
      const conditions: WhereOptions[] = before(query.cursor);
      if (query.status) conditions.push({ status: query.status });
      if (query.refundStatus) conditions.push({ refundStatus: query.refundStatus });
      if (query.eventId) conditions.push({ eventId: query.eventId });
      const rows = await EventBooking.findAll({
        where: { [Op.and]: conditions },
        include: [{ model: Event, as: 'event' }],
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: limit + 1,
      });
      const result = page(rows, limit);
      return {
        items: await toAdminBookings(result.items),
        meta: { nextCursor: result.nextCursor },
      };
    },

    booking,

    async refund(actor, bookingId, reason) {
      await deps.payments.refundBooking(actor, bookingId, reason);
      return booking(bookingId);
    },
  };
}
