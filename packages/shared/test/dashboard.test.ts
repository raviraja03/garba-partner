import { describe, expect, it } from 'vitest';
import { roleHasPermission } from '../src/constants/admin.js';
import {
  adminDashboardEventsQuerySchema,
  adminDashboardQuerySchema,
} from '../src/schemas/dashboard.schema.js';

const CITY = '0e4b0c1a-5555-4000-8000-000000000001';

describe('adminDashboardQuerySchema', () => {
  it('accepts IST dates and a city', () => {
    expect(
      adminDashboardQuerySchema.parse({ from: '2026-10-01', to: '2026-10-31', cityId: CITY }),
    ).toEqual({ from: '2026-10-01', to: '2026-10-31', cityId: CITY });
    expect(adminDashboardQuerySchema.parse({})).toEqual({});
  });

  it.each([
    { from: '2026-02-30' },
    { to: '01-10-2026' },
    { cityId: 'ahmedabad' },
    { userId: CITY },
    { limit: '10' },
  ])('rejects %j', (query) => {
    expect(adminDashboardQuerySchema.safeParse(query).success).toBe(false);
  });

  it('clamps the events page size', () => {
    expect(adminDashboardEventsQuerySchema.parse({ limit: '500' }).limit).toBe(50);
    expect(adminDashboardEventsQuerySchema.safeParse({ limit: 'many' }).success).toBe(false);
  });
});

describe('dashboard sections by role', () => {
  it('every role can open the dashboard; revenue and member data are role-specific', () => {
    for (const role of ['super_admin', 'moderator', 'event_manager'] as const) {
      expect(roleHasPermission(role, 'dashboard:view')).toBe(true);
    }
    expect(roleHasPermission('moderator', 'payments:view')).toBe(false);
    expect(roleHasPermission('event_manager', 'users:view')).toBe(false);
    expect(roleHasPermission('event_manager', 'reports:manage')).toBe(false);
  });
});
