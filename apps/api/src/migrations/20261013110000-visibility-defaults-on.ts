import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * New members start visible: "Show me in partner discovery" and "Show my area on my profile"
 * are on by default (product decision, 2026-10-13). Both are shown, switched on, on the last
 * onboarding step, where the member can turn them off before finishing.
 *
 * Only the DEFAULTS change. Existing rows are left exactly as they are: a member who has
 * discovery off may have chosen that, and this migration cannot tell.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE user_preferences
       ALTER COLUMN discovery_enabled SET DEFAULT true,
       ALTER COLUMN show_area SET DEFAULT true`,
    `COMMENT ON COLUMN user_preferences.discovery_enabled IS 'Whether the member can be found in partner discovery. On by default; the member can pause it at any time.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE user_preferences
       ALTER COLUMN discovery_enabled SET DEFAULT false,
       ALTER COLUMN show_area SET DEFAULT false`,
  ]);
};
