/**
 * Transport-level authentication constants shared by the API and the frontends.
 * See docs/auth/session-management.md.
 */

/** Refresh-token cookies (httpOnly; never readable from JavaScript). */
export const MEMBER_REFRESH_COOKIE = 'gp_rt';
export const ADMIN_REFRESH_COOKIE = 'gp_admin_rt';

/**
 * Header that cookie-authenticated endpoints (refresh, logout) require. Browsers never attach
 * custom headers to cross-site requests without a CORS preflight, so this blocks CSRF.
 */
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = {
  web: 'gp-web',
  admin: 'gp-admin',
} as const;
