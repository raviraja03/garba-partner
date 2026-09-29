import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '../src/constants/admin.js';
import {
  adminRefundSchema,
  createOrderSchema,
  eventPassSettingsSchema,
  idempotencyKeySchema,
  verifyPaymentSchema,
} from '../src/schemas/payment.schema.js';

const ID = '0e4b0c1a-5555-4000-8000-000000000001';

describe('createOrderSchema', () => {
  it('accepts an event and a quantity only', () => {
    expect(createOrderSchema.parse({ eventId: ID, quantity: 2 })).toEqual({
      eventId: ID,
      quantity: 2,
    });
  });

  it.each([
    { eventId: ID, quantity: 0 },
    { eventId: ID, quantity: 7 },
    { eventId: ID, quantity: 1.5 },
    { eventId: ID, quantity: '2' },
    { eventId: 'nope', quantity: 1 },
    // The amount is never accepted from the client.
    { eventId: ID, quantity: 1, amountPaise: 100 },
    { eventId: ID, quantity: 1, pricePaise: 100 },
  ])('rejects %j', (body) => {
    expect(createOrderSchema.safeParse(body).success).toBe(false);
  });

  it('requires a UUID idempotency key', () => {
    expect(idempotencyKeySchema.safeParse(ID).success).toBe(true);
    expect(idempotencyKeySchema.safeParse('').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('retry-1').success).toBe(false);
  });
});

describe('verifyPaymentSchema', () => {
  const valid = {
    razorpayOrderId: 'order_NXj0fY3kQy2m1a',
    razorpayPaymentId: 'pay_NXj1Ab2cD3eF4g',
    razorpaySignature: 'a'.repeat(64),
  };

  it('accepts Razorpay checkout results', () => {
    expect(verifyPaymentSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    { ...valid, razorpayOrderId: 'pay_NXj0fY3kQy2m1a' },
    { ...valid, razorpayPaymentId: 'order_NXj1Ab2cD3eF4g' },
    { ...valid, razorpaySignature: 'z'.repeat(64) },
    { ...valid, razorpaySignature: 'a'.repeat(63) },
    { ...valid, status: 'captured' },
  ])('rejects %j', (body) => {
    expect(verifyPaymentSchema.safeParse(body).success).toBe(false);
  });
});

describe('eventPassSettingsSchema', () => {
  it('accepts a price and capacity, or nulls', () => {
    expect(eventPassSettingsSchema.safeParse({ pricePaise: 49_900, capacity: 200 }).success).toBe(
      true,
    );
    expect(eventPassSettingsSchema.safeParse({ pricePaise: null, capacity: null }).success).toBe(
      true,
    );
  });

  it.each([
    { pricePaise: 99, capacity: null },
    { pricePaise: 1_000_001, capacity: null },
    { pricePaise: 499.5, capacity: null },
    { pricePaise: 49_900, capacity: 0 },
    { pricePaise: 49_900 },
  ])('rejects %j', (body) => {
    expect(eventPassSettingsSchema.safeParse(body).success).toBe(false);
  });
});

describe('refunds', () => {
  it('need a reason', () => {
    expect(adminRefundSchema.safeParse({ reason: 'ok' }).success).toBe(false);
    expect(adminRefundSchema.parse({ reason: '  Customer cannot attend  ' })).toEqual({
      reason: 'Customer cannot attend',
    });
  });

  it('are reserved to super admins; event managers can view payments', () => {
    expect(ROLE_PERMISSIONS.super_admin).toContain('payments:refund');
    expect(ROLE_PERMISSIONS.event_manager).toContain('payments:view');
    expect(ROLE_PERMISSIONS.event_manager).not.toContain('payments:refund');
    expect(ROLE_PERMISSIONS.moderator).not.toContain('payments:view');
  });
});
