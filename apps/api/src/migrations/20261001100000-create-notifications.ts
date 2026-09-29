import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

const TYPES = [
  'interest_received',
  'interest_accepted',
  'match_created',
  'new_message',
  'verification_completed',
  'event_reminder',
  'safety',
];
const inList = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/**
 * In-app notifications (docs/notifications/notifications.md).
 *
 * References are real columns with foreign keys (not JSON), so a notification disappears with
 * the member, match, interest or event it points to. `data` holds only small non-personal
 * values (a safety kind, a verification outcome); never message text, phone numbers, locations
 * or moderator notes.
 *
 * - One UNREAD `new_message` notification per member and chat: further messages bump `count`
 *   and `occurred_at` instead of adding rows.
 * - At most one `event_reminder` per member and event.
 * - `notification_preferences`: one optional row per member; a missing row means "all on".
 *   There is no column for `safety`: safety notifications can't be turned off.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE notifications (
       id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       type           varchar(30) NOT NULL,
       actor_user_id  uuid REFERENCES users (id) ON DELETE CASCADE,
       match_id       uuid REFERENCES matches (id) ON DELETE CASCADE,
       interest_id    uuid REFERENCES partner_interests (id) ON DELETE CASCADE,
       event_id       uuid REFERENCES events (id) ON DELETE CASCADE,
       data           jsonb NOT NULL DEFAULT '{}'::jsonb,
       count          integer NOT NULL DEFAULT 1,
       occurred_at    timestamptz NOT NULL DEFAULT now(),
       read_at        timestamptz,
       created_at     timestamptz NOT NULL DEFAULT now(),
       updated_at     timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT notifications_type_check CHECK (type IN (${inList(TYPES)})),
       CONSTRAINT notifications_count_check CHECK (count >= 1),
       CONSTRAINT notifications_not_self_check CHECK (actor_user_id IS NULL OR actor_user_id <> user_id),
       CONSTRAINT notifications_match_required_check
         CHECK (type NOT IN ('match_created', 'new_message', 'interest_accepted') OR match_id IS NOT NULL),
       CONSTRAINT notifications_event_required_check
         CHECK (type <> 'event_reminder' OR event_id IS NOT NULL)
     )`,

    // The member's list (newest first) and unread count.
    `CREATE INDEX notifications_user_occurred_idx ON notifications (user_id, occurred_at DESC, id DESC)`,
    `CREATE INDEX notifications_user_unread_idx ON notifications (user_id) WHERE read_at IS NULL`,
    // Collapsing and de-duplication.
    `CREATE UNIQUE INDEX notifications_one_unread_message_per_chat_unique
       ON notifications (user_id, match_id) WHERE type = 'new_message' AND read_at IS NULL`,
    `CREATE UNIQUE INDEX notifications_one_reminder_per_event_unique
       ON notifications (user_id, event_id) WHERE type = 'event_reminder'`,
    // Removing notifications between two members (block/report), retention and monitoring.
    `CREATE INDEX notifications_actor_idx ON notifications (actor_user_id, user_id)
       WHERE actor_user_id IS NOT NULL`,
    `CREATE INDEX notifications_occurred_at_idx ON notifications (occurred_at)`,
    `CREATE INDEX notifications_type_occurred_idx ON notifications (type, occurred_at)`,
    updatedAtTrigger('notifications'),

    `CREATE TABLE notification_preferences (
       user_id                 uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
       interest_received       boolean NOT NULL DEFAULT true,
       interest_accepted       boolean NOT NULL DEFAULT true,
       match_created           boolean NOT NULL DEFAULT true,
       new_message             boolean NOT NULL DEFAULT true,
       verification_completed  boolean NOT NULL DEFAULT true,
       event_reminder          boolean NOT NULL DEFAULT true,
       created_at              timestamptz NOT NULL DEFAULT now(),
       updated_at              timestamptz NOT NULL DEFAULT now()
     )`,
    updatedAtTrigger('notification_preferences'),

    `COMMENT ON COLUMN notifications.data IS 'Small non-personal values only (safety kind, verification outcome). Never message text, contact details, locations or moderator notes.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `DROP TABLE IF EXISTS notification_preferences`,
    `DROP TABLE IF EXISTS notifications`,
  ]);
};
