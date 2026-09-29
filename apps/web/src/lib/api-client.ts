import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  type ApiResponse,
  type ErrorCode,
  type ValidationIssue,
  type MemberSessionDto,
} from '@garba-partner/shared';
import { env } from './env';

export type ApiClientErrorCode = ErrorCode | 'NETWORK_ERROR';

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: ApiClientErrorCode,
    readonly status: number,
    /** Field-level validation issues (VALIDATION_ERROR only). */
    readonly details: ValidationIssue[] = [],
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

/** The current in-memory access token (the chat socket sends it in its handshake). */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Called when a silent refresh fails, so the auth state can switch to anonymous. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

// --- Low-level request ------------------------------------------------------------------------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Multipart body (file uploads). The browser sets the Content-Type boundary itself. */
  formData?: FormData;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Attach the access token and retry once after a silent refresh on 401. */
  authenticated?: boolean;
  /** Return the whole success envelope (e.g. to read pagination `meta`) instead of `data`. */
  envelope?: boolean;
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
      ...(options.formData ? { body: options.formData } : {}),
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
  if (!body.success) {
    throw new ApiClientError(
      body.message,
      body.error.code,
      response.status,
      body.error.details ?? [],
    );
  }
  return options.envelope ? (body as unknown as TData) : body.data;
}

// --- Session refresh (single flight, serialised across tabs) --------------------------------

let refreshInFlight: Promise<MemberSessionDto> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token. Concurrent callers share one
 * request, and the Web Locks API serialises refreshes across browser tabs (the refresh token
 * rotates, so two parallel refreshes would otherwise race).
 */
export function refreshSession(): Promise<MemberSessionDto> {
  refreshInFlight ??= (async () => {
    const run = () =>
      send<MemberSessionDto>('/auth/refresh', {
        method: 'POST',
        headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE.web },
      });
    try {
      const session =
        typeof navigator !== 'undefined' && 'locks' in navigator
          ? await navigator.locks.request('gp-member-refresh', run)
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
