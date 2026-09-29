import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

/**
 * A member's attendance at an event (docs/matching/discovery.md#event-attendance).
 * Attendance is PRIVATE: another member can only learn about it when BOTH have
 * `looking_for_partner = true` for the same event (reciprocal visibility). Attendee lists are
 * never exposed.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE event_attendances (
       id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       event_id             uuid NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
       user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       status               varchar(20) NOT NULL,
       looking_for_partner  boolean NOT NULL DEFAULT false,
       created_at           timestamptz NOT NULL DEFAULT now(),
       updated_at           timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT event_attendances_event_user_unique UNIQUE (event_id, user_id),
       CONSTRAINT event_attendances_status_check CHECK (status IN ('going', 'interested'))
     )`,

    // Event-mode discovery: candidates looking for a partner at one event.
    `CREATE INDEX event_attendances_looking_event_idx ON event_attendances (event_id, user_id)
       WHERE looking_for_partner`,
    // "Same event" scoring and the member's own list: events a member is looking at.
    `CREATE INDEX event_attendances_looking_user_idx ON event_attendances (user_id, event_id)
       WHERE looking_for_partner`,
    `CREATE INDEX event_attendances_user_id_created_at_idx ON event_attendances (user_id, created_at DESC)`,
    updatedAtTrigger('event_attendances'),

    `COMMENT ON TABLE event_attendances IS 'Private. Visible to another member only when both look for a partner at the same event.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS event_attendances`]);
};
