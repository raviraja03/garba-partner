export const APP_NAME = 'Garba Partner';

/** Current REST API version. Breaking changes ship as a new version side by side. */
export const API_VERSION = 'v1';

/** Base path of the member-facing REST API. */
export const API_PREFIX = `/api/${API_VERSION}`;

/** Base path of the admin REST API (served only on the admin host in production). */
export const ADMIN_API_PREFIX = `${API_PREFIX}/admin`;

/** Header used to correlate a request across client, Nginx and API logs. */
export const REQUEST_ID_HEADER = 'X-Request-Id';
