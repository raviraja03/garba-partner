import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Message reports (docs/chat/moderation.md). A report can point at the reported message and its
 * match. Both are `SET NULL` on delete: the evidence snapshot in `reports.evidence` survives
 * deletion of the conversation.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE reports
       ADD COLUMN message_id uuid REFERENCES messages (id) ON DELETE SET NULL,
       ADD COLUMN match_id uuid REFERENCES matches (id) ON DELETE SET NULL`,
    `CREATE INDEX reports_match_id_idx ON reports (match_id) WHERE match_id IS NOT NULL`,
    `CREATE INDEX reports_message_id_idx ON reports (message_id) WHERE message_id IS NOT NULL`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `DROP INDEX IF EXISTS reports_message_id_idx`,
    `DROP INDEX IF EXISTS reports_match_id_idx`,
    `ALTER TABLE reports DROP COLUMN IF EXISTS match_id, DROP COLUMN IF EXISTS message_id`,
  ]);
};
