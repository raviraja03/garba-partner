/** Response data of `GET /api/v1/health`. */
export interface HealthDto {
  status: 'ok';
  /** ISO-8601 UTC timestamp of the check. */
  timestamp: string;
}
