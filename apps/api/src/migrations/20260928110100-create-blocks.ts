import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/** Member blocks (docs/safety/abuse-prevention.md#2-blocking). Effects are symmetric and enforced in every query. */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE blocks (
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       blocker_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       blocked_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       created_at  timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT blocks_pair_unique UNIQUE (blocker_id, blocked_id),
       CONSTRAINT blocks_not_self_check CHECK (blocker_id <> blocked_id)
     )`,
    // The unique constraint covers lookups by blocker; this covers "who blocked me".
    `CREATE INDEX blocks_blocked_id_idx ON blocks (blocked_id)`,
    `COMMENT ON TABLE blocks IS 'Silent, symmetric blocks. The blocked member is never notified.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS blocks`]);
};
