import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Product rule (owner decision, 2026-10-14): a member who has a profile with a photo is shown
 * in Discover. Discovery became on-by-default for new members in
 * `20261013110000-visibility-defaults-on`; members who joined before that still had the old
 * default (off) and stayed hidden even after adding a photo. This turns it on for them.
 *
 * - It cannot tell a member who chose "off" from one who never touched the switch, so it
 *   turns on both. Members can pause discovery again at any time in their preferences.
 * - Every other rule still applies: no photo, a suspended account, a block or a report keeps a
 *   member out of Discover exactly as before.
 * - `show_area` is NOT changed for existing members.
 * - Not reversed by `down`: which rows were off is not recorded.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `UPDATE user_preferences SET discovery_enabled = true WHERE NOT discovery_enabled`,
  ]);
};

export const down: MigrationFn<MigrationContext> = () => Promise.resolve();
