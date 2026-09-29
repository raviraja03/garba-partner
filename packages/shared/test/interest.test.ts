import { describe, expect, it } from 'vitest';
import { connectionListQuerySchema, sendInterestSchema } from '../src/schemas/interest.schema.js';

const RECEIVER = '0e4b0c1a-5555-4000-8000-000000000001';

describe('sendInterestSchema', () => {
  it('accepts a receiver and an optional event', () => {
    expect(sendInterestSchema.safeParse({ receiverId: RECEIVER }).success).toBe(true);
    expect(
      sendInterestSchema.safeParse({
        receiverId: RECEIVER,
        eventId: '0e4b0c1a-5555-4000-8000-000000000002',
      }).success,
    ).toBe(true);
  });

  it.each([
    {},
    { receiverId: 'not-a-uuid' },
    { receiverId: RECEIVER, eventId: 'x' },
    // The sender always comes from the session: extra keys are refused (no spoofing).
    { receiverId: RECEIVER, senderId: RECEIVER },
    { receiverId: RECEIVER, status: 'accepted' },
  ])('rejects %o', (body) => {
    expect(sendInterestSchema.safeParse(body).success).toBe(false);
  });
});

describe('connectionListQuerySchema', () => {
  it('parses cursor and limit only', () => {
    expect(connectionListQuerySchema.safeParse({ limit: '10' }).data).toEqual({ limit: 10 });
    expect(connectionListQuerySchema.safeParse({ status: 'declined' }).success).toBe(false);
    expect(connectionListQuerySchema.safeParse({ limit: 'ten' }).success).toBe(false);
  });
});
