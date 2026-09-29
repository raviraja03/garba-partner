import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Chat messages (docs/chat/architecture.md). Text only, 1–1000 characters.
 *
 * - Messages belong to a match; only its two members may read or write them (enforced in the
 *   service on every request, never by the client).
 * - `(sender_id, client_message_id)` is unique: retries of the same send never duplicate.
 * - Messages are IMMUTABLE: a trigger rejects UPDATE (no editing). Rows are only removed with
 *   their match/user (CASCADE) or by a retention purge.
 * - `contains_contact_info` is moderation context only and is never returned to members.
 *
 * `matches` gains the chat list order (`last_message_at`) and each member's read position.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE messages (
       id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       match_id               uuid NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
       sender_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       client_message_id      uuid NOT NULL,
       body                   varchar(1000) NOT NULL,
       contains_contact_info  boolean NOT NULL DEFAULT false,
       created_at             timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT messages_sender_client_message_unique UNIQUE (sender_id, client_message_id),
       CONSTRAINT messages_body_not_blank_check CHECK (char_length(btrim(body)) > 0)
     )`,
    // History (newest first, keyset) and unread counts.
    `CREATE INDEX messages_match_created_at_idx ON messages (match_id, created_at DESC, id DESC)`,
    `CREATE TRIGGER messages_immutable BEFORE UPDATE ON messages
       FOR EACH ROW EXECUTE FUNCTION reject_append_only_changes()`,
    `COMMENT ON COLUMN messages.contains_contact_info IS 'Moderation context only; never returned to members'`,

    `ALTER TABLE matches
       ADD COLUMN last_message_at timestamptz,
       ADD COLUMN user_a_last_read_at timestamptz,
       ADD COLUMN user_b_last_read_at timestamptz`,
    // Chat lists: each member's active matches by latest activity.
    `CREATE INDEX matches_user_a_activity_idx
       ON matches (user_a_id, (COALESCE(last_message_at, created_at)) DESC, id DESC)
       WHERE status = 'active'`,
    `CREATE INDEX matches_user_b_activity_idx
       ON matches (user_b_id, (COALESCE(last_message_at, created_at)) DESC, id DESC)
       WHERE status = 'active'`,
    // Retention purge of messages from ended matches (docs/chat/safety.md#retention).
    `CREATE INDEX matches_ended_at_idx ON matches (ended_at) WHERE status <> 'active'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `DROP INDEX IF EXISTS matches_ended_at_idx`,
    `DROP INDEX IF EXISTS matches_user_b_activity_idx`,
    `DROP INDEX IF EXISTS matches_user_a_activity_idx`,
    `ALTER TABLE matches
       DROP COLUMN IF EXISTS user_b_last_read_at,
       DROP COLUMN IF EXISTS user_a_last_read_at,
       DROP COLUMN IF EXISTS last_message_at`,
    `DROP TABLE IF EXISTS messages`,
  ]);
};
