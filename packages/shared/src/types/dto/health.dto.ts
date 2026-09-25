/** Status of a dependency checked by the health endpoint. */
export type DependencyStatus = 'ok' | 'unavailable';

/** Response data of `GET /api/v1/health` (HTTP 200). Failures return 503 SERVICE_UNAVAILABLE. */
export interface HealthDto {
  status: 'ok';
  database: DependencyStatus;
  /** ISO-8601 UTC timestamp of the check. */
  timestamp: string;
}
