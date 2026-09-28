import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE user_preferences ADD COLUMN verified_only boolean NOT NULL DEFAULT false`,
    `COMMENT ON COLUMN user_preferences.verified_only IS 'Only show photo-verified members in discovery (used by matching, later phase).'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`ALTER TABLE user_preferences DROP COLUMN verified_only`]);
};
