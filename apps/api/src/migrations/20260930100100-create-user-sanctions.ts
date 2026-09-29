import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

const inList = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

const SANCTION_TYPES = ['warning', 'chat_restriction', 'suspension', 'ban'];
const REASON_CODES = [
  'fake_profile',
  'harassment',
  'spam',
  'asking_for_money',
  'inappropriate_behavior',
  'threatening_behavior',
  'impersonation',
  'underage',
  'other',
];
/** "Active" = neither revoked by a moderator nor expired. */
const ACTIVE = `revoked_at IS NULL AND expired_at IS NULL`;

/**
 * Sanctions applied by moderators (docs/safety/admin-actions.md). One row per warning, chat
 * restriction, suspension or ban: the history of what happened to an account and why.
 * `users.status` and `users.chat_restricted_at` are cached projections of the active rows,
 * updated in the same transaction. Rows are never deleted: lifting a sanction sets `revoked_at`
 * (moderator) or `expired_at` (timed sanction ended).
 *
 * Also adds chat safety flags: `messages.contains_money_request` (moderation context for scam
 * detection, set at insert time) and an index for per-sender detection queries.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE user_sanctions (
       id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id              uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
       type                 varchar(20) NOT NULL,
       reason_code          varchar(30) NOT NULL,
       note                 text NOT NULL,
       report_id            uuid REFERENCES reports (id) ON DELETE SET NULL,
       starts_at            timestamptz NOT NULL DEFAULT now(),
       ends_at              timestamptz,
       created_by_admin_id  uuid NOT NULL REFERENCES admin_users (id) ON DELETE RESTRICT,
       acknowledged_at      timestamptz,
       revoked_at           timestamptz,
       revoked_by_admin_id  uuid REFERENCES admin_users (id) ON DELETE RESTRICT,
       revoke_reason        varchar(500),
       expired_at           timestamptz,
       created_at           timestamptz NOT NULL DEFAULT now(),
       updated_at           timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT user_sanctions_type_check CHECK (type IN (${inList(SANCTION_TYPES)})),
       CONSTRAINT user_sanctions_reason_code_check CHECK (reason_code IN (${inList(REASON_CODES)})),
       CONSTRAINT user_sanctions_note_not_blank_check CHECK (length(btrim(note)) > 0),
       CONSTRAINT user_sanctions_ends_after_start_check CHECK (ends_at IS NULL OR ends_at > starts_at),
       -- Only suspensions and chat restrictions can be timed; bans are permanent.
       CONSTRAINT user_sanctions_timed_types_check
         CHECK (ends_at IS NULL OR type IN ('suspension', 'chat_restriction')),
       CONSTRAINT user_sanctions_expiry_check CHECK (expired_at IS NULL OR ends_at IS NOT NULL),
       CONSTRAINT user_sanctions_ack_warning_only_check
         CHECK (acknowledged_at IS NULL OR type = 'warning'),
       CONSTRAINT user_sanctions_revoke_consistency_check CHECK (
         (revoked_at IS NULL) = (revoked_by_admin_id IS NULL)
         AND (revoked_at IS NULL) = (revoke_reason IS NULL)
       )
     )`,

    `CREATE INDEX user_sanctions_user_id_created_at_idx ON user_sanctions (user_id, created_at DESC)`,
    `CREATE INDEX user_sanctions_report_id_idx ON user_sanctions (report_id) WHERE report_id IS NOT NULL`,
    // Expiry job: timed sanctions that are still running.
    `CREATE INDEX user_sanctions_expiry_idx ON user_sanctions (ends_at)
       WHERE ends_at IS NOT NULL AND ${ACTIVE}`,
    // Member notices: unacknowledged warnings.
    `CREATE INDEX user_sanctions_open_warnings_idx ON user_sanctions (user_id, created_at DESC)
       WHERE type = 'warning' AND acknowledged_at IS NULL AND ${ACTIVE}`,
    // At most one active suspension, chat restriction and ban per member.
    `CREATE UNIQUE INDEX user_sanctions_one_active_unique ON user_sanctions (user_id, type)
       WHERE type <> 'warning' AND ${ACTIVE}`,
    updatedAtTrigger('user_sanctions'),

    `ALTER TABLE users ADD COLUMN chat_restricted_at timestamptz`,

    `ALTER TABLE messages ADD COLUMN contains_money_request boolean NOT NULL DEFAULT false`,
    `CREATE INDEX messages_sender_id_created_at_idx ON messages (sender_id, created_at DESC)`,

    `COMMENT ON COLUMN user_sanctions.note IS 'Internal moderator note. Never shown to the member.'`,
    `COMMENT ON COLUMN messages.contains_money_request IS 'Moderation context (scam detection). Never returned to members.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `DROP INDEX IF EXISTS messages_sender_id_created_at_idx`,
    `ALTER TABLE messages DROP COLUMN IF EXISTS contains_money_request`,
    `ALTER TABLE users DROP COLUMN IF EXISTS chat_restricted_at`,
    `DROP TABLE IF EXISTS user_sanctions`,
  ]);
};
