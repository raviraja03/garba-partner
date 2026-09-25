import { useEffect, useState } from 'react';
import type { HealthDto } from '@garba-partner/shared';
import { ApiClientError, apiGet } from '../../lib/api-client';

export type ApiHealthState =
  | { status: 'checking' }
  | { status: 'online'; checkedAt: string }
  | { status: 'offline'; reason: string };

/** Checks `GET /api/v1/health` once on mount. */
export function useApiHealth(): ApiHealthState {
  const [state, setState] = useState<ApiHealthState>({ status: 'checking' });

  useEffect(() => {
    const controller = new AbortController();

    apiGet<HealthDto>('/health', { signal: controller.signal })
      .then((health) => {
        setState({ status: 'online', checkedAt: health.timestamp });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const reason = error instanceof ApiClientError ? error.message : 'Unexpected error.';
        setState({ status: 'offline', reason });
      });

    return () => {
      controller.abort();
    };
  }, []);

  return state;
}
