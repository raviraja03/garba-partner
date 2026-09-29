import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, roleHasPermission } from '../src/constants/admin.js';
import {
  REPORT_PRIORITY_BY_REASON,
  REPORT_REASONS,
  REPORT_RESOLUTION_ACTIONS,
} from '../src/constants/enums.js';
import { COMMUNITY_GUIDELINES, guidelineForReason } from '../src/constants/guidelines.js';
import {
  adminAuditLogQuerySchema,
  adminReportListQuerySchema,
  adminResolveReportSchema,
  adminSanctionSchema,
  createReportSchema,
} from '../src/schemas/safety.schema.js';
import { looksLikeMoneyRequest } from '../src/utils/text.js';

const ID = '0e4b0c1a-5555-4000-8000-000000000001';

describe('report reasons', () => {
  it('are the product reasons plus underage (18+ platform)', () => {
    expect([...REPORT_REASONS].sort()).toEqual(
      [
        'asking_for_money',
        'fake_profile',
        'harassment',
        'impersonation',
        'inappropriate_behavior',
        'other',
        'spam',
        'threatening_behavior',
        'underage',
      ].sort(),
    );
  });

  it('treat threats and underage members as P0', () => {
    const p0 = REPORT_REASONS.filter((reason) => REPORT_PRIORITY_BY_REASON[reason] === 0);
    expect(p0.sort()).toEqual(['threatening_behavior', 'underage']);
  });

  it('reject retired reasons', () => {
    for (const reason of ['scam_spam', 'safety_threat', 'sexual_content', 'hate_speech']) {
      expect(createReportSchema.safeParse({ reportedUserId: ID, reason }).success).toBe(false);
    }
    expect(createReportSchema.safeParse({ reportedUserId: ID, reason: 'spam' }).success).toBe(true);
  });
});

describe('community guidelines', () => {
  it('cover every reason except "other", each exactly once', () => {
    for (const reason of REPORT_REASONS) {
      const matches = COMMUNITY_GUIDELINES.filter((g) => g.reasons.includes(reason));
      expect(matches).toHaveLength(reason === 'other' ? 0 : 1);
    }
    expect(guidelineForReason('asking_for_money')?.id).toBe('never_ask_for_money');
    expect(guidelineForReason('other')).toBeNull();
  });

  it('have unique ids', () => {
    const ids = COMMUNITY_GUIDELINES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('looksLikeMoneyRequest', () => {
  it.each([
    'Can you send me 500?',
    'send me ₹2000 please',
    'Pay me back tomorrow',
    'I need money urgently for my mother',
    'Please transfer some cash, I will return it',
    'Can you lend me 1000 rupees',
    'my gpay number is this one',
    'Just do a Google Pay to me',
    'PhonePe karo',
    'Paytm me the amount',
    'what is your UPI',
    'rohan.k@okaxis',
    'Tell me the OTP you received',
    'share your card number and cvv',
    'Buy me a gift card',
    'Great bitcoin investment plan, double in a week',
    'paise bhejo yaar',
    'thoda paisa chahiye',
    'udhaar de do please',
    'rupiya moklo',
  ])('flags %j', (text) => {
    expect(looksLikeMoneyRequest(text)).toBe(true);
  });

  it.each([
    'The pass is ₹500 at the gate',
    'Rs 300 for the early bird tickets',
    'Send me the location please',
    'Give me a call when you reach',
    'I will pay for my own pass online',
    'Let us meet at the main entrance at 8',
    'my email is riya@example.com',
    'Do you want to practise the three-clap step?',
  ])('does not flag %j', (text) => {
    expect(looksLikeMoneyRequest(text)).toBe(false);
  });
});

describe('admin moderation schemas', () => {
  it('resolution actions include restrict_chat', () => {
    expect(REPORT_RESOLUTION_ACTIONS).toContain('restrict_chat');
    expect(
      adminResolveReportSchema.safeParse({
        action: 'restrict_chat',
        note: 'Hostile messages',
        durationDays: 7,
      }).success,
    ).toBe(true);
  });

  it.each([0, 2, 5, 365, '7'])('rejects durationDays %j', (durationDays) => {
    expect(adminSanctionSchema.safeParse({ reason: 'Valid reason', durationDays }).success).toBe(
      false,
    );
  });

  it('requires a real reason and a known guideline category', () => {
    expect(adminSanctionSchema.safeParse({ reason: 'ok' }).success).toBe(false);
    expect(
      adminSanctionSchema.safeParse({ reason: 'Valid reason', reasonCode: 'scam_spam' }).success,
    ).toBe(false);
    expect(
      adminSanctionSchema.parse({
        reason: '  Asked for money twice  ',
        reasonCode: 'asking_for_money',
        durationDays: 3,
      }),
    ).toEqual({ reason: 'Asked for money twice', reasonCode: 'asking_for_money', durationDays: 3 });
  });

  it('filters the queue by reason and source', () => {
    expect(adminReportListQuerySchema.parse({ source: 'system', reason: 'spam' })).toEqual({
      source: 'system',
      reason: 'spam',
    });
    expect(adminReportListQuerySchema.safeParse({ source: 'robot' }).success).toBe(false);
  });

  it('validates audit log filters', () => {
    expect(adminAuditLogQuerySchema.safeParse({ action: 'user.ban', targetId: ID }).success).toBe(
      true,
    );
    expect(adminAuditLogQuerySchema.safeParse({ action: 'DROP TABLE' }).success).toBe(false);
    expect(adminAuditLogQuerySchema.safeParse({ targetId: 'nope' }).success).toBe(false);
  });
});

describe('moderation permissions', () => {
  it('reserve lifting bans and audit logs to super admins', () => {
    expect(roleHasPermission('super_admin', 'users:unban')).toBe(true);
    expect(roleHasPermission('moderator', 'users:unban')).toBe(false);
    expect(roleHasPermission('moderator', 'audit:view')).toBe(false);
    expect(roleHasPermission('moderator', 'safety_logs:view')).toBe(true);
    expect(ROLE_PERMISSIONS.event_manager).not.toContain('users:sanction');
    expect(ROLE_PERMISSIONS.event_manager).not.toContain('safety_logs:view');
  });
});
