import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  type ApiResponse,
  type ErrorCode,
  type AdminSessionDto,
} from '@garba-partner/shared';
import { env } from './env';

export type ApiClientErrorCode = ErrorCode | 'NETWORK_ERROR';

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: ApiClientErrorCode,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// --- Access token: kept in memory only (never localStorage/sessionStorage) -------------------

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Called when a silent refresh fails, so the auth state can switch to anonymous. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

// --- Low-level request ------------------------------------------------------------------------

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Attach the access token and retry once after a silent refresh on 401. */
  authenticated?: boolean;
}

async function send<TData>(path: string, options: RequestOptions): Promise<TData> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.authenticated && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiClientError('Unable to reach the server.', 'NETWORK_ERROR', 0);
  }

  const body = (await response.json().catch(() => null)) as ApiResponse<TData> | null;
  if (!body) {
    throw new ApiClientError(
      'Unexpected response from the server.',
      'INTERNAL_ERROR',
      response.status,
    );
  }
  if (!body.success) throw new ApiClientError(body.message, body.error.code, response.status);
  return body.data;
}

// --- Session refresh (single flight, serialised across tabs) --------------------------------

let refreshInFlight: Promise<AdminSessionDto> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token. Concurrent callers share one
 * request, and the Web Locks API serialises refreshes across browser tabs (the refresh token
 * rotates, so two parallel refreshes would otherwise race).
 */
export function refreshSession(): Promise<AdminSessionDto> {
  refreshInFlight ??= (async () => {
    const run = () =>
      send<AdminSessionDto>('/admin/auth/refresh', {
        method: 'POST',
        headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE.admin },
      });
    try {
      const session =
        typeof navigator !== 'undefined' && 'locks' in navigator
          ? await navigator.locks.request('gp-admin-refresh', run)
          : await run();
      setAccessToken(session.accessToken);
      return session;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** API call helper. Authenticated calls transparently refresh once on 401. */
export async function api<TData>(path: string, options: RequestOptions = {}): Promise<TData> {
  try {
    return await send<TData>(path, options);
  } catch (error) {
    const expired =
      options.authenticated && error instanceof ApiClientError && error.status === 401;
    if (!expired) throw error;

    try {
      await refreshSession();
    } catch {
      setAccessToken(null);
      onSessionExpired?.();
      throw error;
    }
    return send<TData>(path, options);
  }
}

/** Backwards-compatible GET helper. */
export function apiGet<TData>(path: string, options: { signal?: AbortSignal } = {}) {
  return api<TData>(path, options);
}
