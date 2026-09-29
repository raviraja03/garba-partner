/**
 * Admin roles and permissions (docs/architecture/application-architecture.md §7.3).
 * The API enforces these; the admin UI only uses them to hide navigation.
 */
export const ADMIN_ROLES = ['super_admin', 'moderator', 'event_manager'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_STATUSES = ['active', 'disabled'] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export const ADMIN_PERMISSIONS = [
  'dashboard:view',
  'users:view',
  'users:sanction',
  'users:reveal_phone',
  'users:unban',
  'reports:manage',
  'verifications:review',
  'photos:review',
  'events:view',
  'events:manage',
  'locations:manage',
  'audit:view',
  'safety_logs:view',
  'admins:manage',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly AdminPermission[]>> = {
  super_admin: ADMIN_PERMISSIONS,
  moderator: [
    'dashboard:view',
    'users:view',
    'users:sanction',
    'reports:manage',
    'safety_logs:view',
    'verifications:review',
    'photos:review',
    'events:view',
  ],
  event_manager: ['dashboard:view', 'events:view', 'events:manage', 'locations:manage'],
};

export function roleHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
