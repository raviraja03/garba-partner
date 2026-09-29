import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Indexes for partner discovery (docs/matching/matching-logic.md#query-and-indexes).
 * The eligibility query filters members by account state, city, gender and date of birth, checks
 * available dates, and excludes blocked/reported pairs.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    // Only discoverable accounts: active, onboarded, not hidden, not deleted.
    `CREATE INDEX users_discoverable_idx ON users (id)
       WHERE status = 'active' AND deleted_at IS NULL AND NOT hidden_from_discovery
         AND onboarding_completed_at IS NOT NULL`,
    // Candidate filtering by city, gender and age (date of birth range); photo required.
    `CREATE INDEX user_profiles_discovery_idx ON user_profiles (city_id, gender, date_of_birth)
       WHERE image_public_id IS NOT NULL`,
    // "Available on date" filter (@>) and shared-dates overlap (&&).
    `CREATE INDEX user_profiles_available_dates_gin_idx ON user_profiles USING gin (available_dates)`,
    // "Reported by the viewer" exclusion (any report status).
    `CREATE INDEX reports_reporter_reported_idx ON reports (reporter_id, reported_user_id)
       WHERE reporter_id IS NOT NULL`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `DROP INDEX IF EXISTS reports_reporter_reported_idx`,
    `DROP INDEX IF EXISTS user_profiles_available_dates_gin_idx`,
    `DROP INDEX IF EXISTS user_profiles_discovery_idx`,
    `DROP INDEX IF EXISTS users_discoverable_idx`,
  ]);
};
