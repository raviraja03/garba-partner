import { describe, expect, it } from 'vitest';
import {
  markReadSchema,
  messageBodySchema,
  sendMessageSchema,
  socketSendMessageSchema,
} from '../src/schemas/chat.schema.js';
import { createReportSchema } from '../src/schemas/safety.schema.js';
import { looksLikeContactDetails } from '../src/utils/text.js';

const ID = '0e4b0c1a-5555-4000-8000-000000000001';

describe('messageBodySchema', () => {
  it('trims, removes invisible characters and keeps line breaks', () => {
    expect(messageBodySchema.parse('  hi​ there \r\nsee you  ')).toBe('hi there \nsee you');
  });

  it.each(['', '   ', '​​', 'x'.repeat(1001)])('rejects %j', (body) => {
    expect(messageBodySchema.safeParse(body).success).toBe(false);
  });

  it('accepts exactly 1000 characters', () => {
    expect(messageBodySchema.safeParse('x'.repeat(1000)).success).toBe(true);
  });
});

describe('message payloads', () => {
  it('are strict: no sender, status or moderation fields from clients', () => {
    expect(sendMessageSchema.safeParse({ clientMessageId: ID, body: 'hi' }).success).toBe(true);
    expect(
      sendMessageSchema.safeParse({ clientMessageId: ID, body: 'hi', senderId: ID }).success,
    ).toBe(false);
    expect(
      socketSendMessageSchema.safeParse({
        matchId: ID,
        clientMessageId: ID,
        body: 'hi',
        containsContactInfo: false,
      }).success,
    ).toBe(false);
    expect(
      socketSendMessageSchema.safeParse({ matchId: 'x', clientMessageId: ID, body: 'hi' }).success,
    ).toBe(false);
    expect(markReadSchema.safeParse({ lastReadMessageId: 'nope' }).success).toBe(false);
  });

  it('lets a report point at a message', () => {
    expect(
      createReportSchema.safeParse({ reportedUserId: ID, reason: 'harassment', messageId: ID })
        .success,
    ).toBe(true);
    expect(
      createReportSchema.safeParse({ reportedUserId: ID, reason: 'harassment', messageId: 'x' })
        .success,
    ).toBe(false);
  });
});

describe('looksLikeContactDetails', () => {
  it.each([
    'call 98765 43210',
    'mail me at priya@example.com',
    'pay me on priya@okaxis',
    'insta link https://instagram.com/x',
  ])('flags %j', (text) => {
    expect(looksLikeContactDetails(text)).toBe(true);
  });

  it.each(['see you at gate 3 at 8pm', 'I love two-taali!', 'Navratri 2026'])(
    'does not flag %j',
    (text) => {
      expect(looksLikeContactDetails(text)).toBe(false);
    },
  );
});
