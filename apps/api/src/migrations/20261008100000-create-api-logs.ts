import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * One row per API request (docs/development/logging.md), for debugging from the database when
 * the server log is not at hand. Rows are append-only (no `updated_at`) and deleted after
 * `API_LOG_RETENTION_DAYS`.
 *
 * What is deliberately NOT stored: request and response bodies, headers, cookies and query
 * strings. They carry phone numbers, one-time codes, tokens and message text. `endpoint` is the
 * path only; `error_message` is the public error message (4xx) or a truncated, digit-masked
 * internal message (5xx).
 *
 * `user_id` / `admin_id` are set to NULL when the account is removed, so the log never blocks
 * a deletion.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE api_logs (
       id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       request_id          varchar(64) NOT NULL,
       user_id             uuid REFERENCES users (id) ON DELETE SET NULL,
       admin_id            uuid REFERENCES admin_users (id) ON DELETE SET NULL,
       method              varchar(10) NOT NULL,
       endpoint            varchar(255) NOT NULL,
       status_code         smallint NOT NULL,
       response_time_ms    integer NOT NULL,
       ip_address          inet,
       user_agent          varchar(255),
       request_timestamp   timestamptz NOT NULL,
       response_timestamp  timestamptz NOT NULL,
       success             boolean NOT NULL,
       error_code          varchar(40),
       error_message       varchar(300),
       created_at          timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT api_logs_status_code_check CHECK (status_code BETWEEN 100 AND 599),
       CONSTRAINT api_logs_response_time_check CHECK (response_time_ms >= 0)
     )`,

    // Find one request from the ID shown in an error or the X-Request-Id header.
    `CREATE INDEX api_logs_request_id_idx ON api_logs (request_id)`,
    // "What did this member do?" (newest first).
    `CREATE INDEX api_logs_user_created_idx ON api_logs (user_id, created_at DESC)
       WHERE user_id IS NOT NULL`,
    // Time-range browsing and the retention job.
    `CREATE INDEX api_logs_created_at_idx ON api_logs (created_at)`,
    // "Recent failures": only failed requests are indexed, so the index stays small.
    `CREATE INDEX api_logs_failures_idx ON api_logs (status_code, created_at DESC)
       WHERE status_code >= 400`,
    // "Everything that hit this endpoint".
    `CREATE INDEX api_logs_endpoint_created_idx ON api_logs (endpoint, created_at DESC)`,

    `COMMENT ON TABLE api_logs IS 'One row per API request. No bodies, headers, cookies or query strings. Purged after API_LOG_RETENTION_DAYS.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS api_logs`]);
};
