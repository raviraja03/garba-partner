import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Member verification is hidden for now (`MEMBER_VERIFICATION_ENABLED = false`): there is no way
 * to become photo-verified yet, so "Photo-verified members only" matched nobody and left the
 * member's Discover empty. The switch is no longer shown, so anyone who had turned it on could
 * not turn it off again: this clears it.
 *
 * It only widens what those members themselves see. Nobody becomes more visible because of it.
 * Not reversed by `down`: which rows were on is not recorded, and re-enabling it would empty
 * those members' Discover again.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `UPDATE user_preferences SET verified_only = false WHERE verified_only`,
  ]);
};

export const down: MigrationFn<MigrationContext> = () => Promise.resolve();
