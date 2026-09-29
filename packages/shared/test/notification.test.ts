import { describe, expect, it } from 'vitest';
import { CONFIGURABLE_NOTIFICATION_TYPES, NOTIFICATION_TYPES } from '../src/constants/enums.js';
import {
  notificationListQuerySchema,
  updateNotificationPreferencesSchema,
} from '../src/schemas/notification.schema.js';

describe('notification types', () => {
  it('are the product types; safety and booking are always on', () => {
    expect([...NOTIFICATION_TYPES]).toEqual([
      'interest_received',
      'interest_accepted',
      'match_created',
      'new_message',
      'verification_completed',
      'event_reminder',
      'safety',
      'booking',
    ]);
    expect(
      NOTIFICATION_TYPES.filter(
        (t) => !(CONFIGURABLE_NOTIFICATION_TYPES as readonly string[]).includes(t),
      ),
    ).toEqual(['safety', 'booking']);
  });
});

describe('notificationListQuerySchema', () => {
  it('parses and clamps the limit', () => {
    expect(notificationListQuerySchema.parse({ limit: '10', unread: 'true' })).toEqual({
      limit: 10,
      unread: 'true',
    });
    expect(notificationListQuerySchema.parse({ limit: '500' }).limit).toBe(50);
    expect(notificationListQuerySchema.parse({ limit: '0' }).limit).toBe(1);
  });

  it.each([{ limit: 'ten' }, { unread: 'yes' }, { page: '2' }])('rejects %j', (query) => {
    expect(notificationListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('updateNotificationPreferencesSchema', () => {
  it('accepts any subset of configurable types', () => {
    expect(updateNotificationPreferencesSchema.parse({ new_message: false })).toEqual({
      new_message: false,
    });
  });

  it.each([{}, { safety: false }, { new_message: 'no' }, { unknown: true }])(
    'rejects %j',
    (body) => {
      expect(updateNotificationPreferencesSchema.safeParse(body).success).toBe(false);
    },
  );
});
