export const APP_NAME = 'GarbaMates';

/** The brand line. Use sparingly: the footer and the sign-in screens. */
export const APP_TAGLINE = 'Find Your People. Find Your Vibe.';

/**
 * Member verification (the "Photo verified" / "ID verified" badges and the "verified members
 * only" filters). Off: members cannot get verified yet (no selfie step, no review screen), so
 * the badges and filters are hidden everywhere. Turn on when that flow exists.
 * Event and organizer verification is separate and unaffected.
 */
export const MEMBER_VERIFICATION_ENABLED = false;

/** Current REST API version. Breaking changes ship as a new version side by side. */
export const API_VERSION = 'v1';

/** Base path of the member-facing REST API. */
export const API_PREFIX = `/api/${API_VERSION}`;

/** Base path of the admin REST API (served only on the admin host in production). */
export const ADMIN_API_PREFIX = `${API_PREFIX}/admin`;

/** Header used to correlate a request across client, Nginx and API logs. */
export const REQUEST_ID_HEADER = 'X-Request-Id';
