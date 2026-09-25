import type { ApiResponse, ErrorCode } from '@garba-partner/shared';
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

interface RequestOptions {
  signal?: AbortSignal;
}

/** GETs an API path (relative to `/api/v1`) and unwraps the standard response envelope. */
export async function apiGet<TData>(path: string, options: RequestOptions = {}): Promise<TData> {
  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      ...options,
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
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
    throw new ApiClientError(body.message, body.error.code, response.status);
  }
  return body.data;
}
