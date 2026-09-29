import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

/**
 * Garba events (docs/events/event-management.md).
 *
 * Date and times are entered in India Standard Time. `starts_at` / `ends_at` are GENERATED from
 * them (so they can never disagree) and are used for sorting, date filters and "has ended".
 * An end time earlier than the start time means the event ends after midnight.
 *
 * Lifecycle: draft → published ⇄ draft, any → archived (soft delete) → draft.
 * `first_published_at` is never cleared: once an event has been public it can only be archived,
 * never hard-deleted.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE events (
       id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       slug                 varchar(140) NOT NULL,
       name                 varchar(120) NOT NULL,
       description          text NOT NULL,
       organizer_id         uuid NOT NULL REFERENCES event_organizers (id) ON DELETE RESTRICT,
       city_id              uuid NOT NULL REFERENCES cities (id) ON DELETE RESTRICT,
       area_id              uuid,
       venue_name           varchar(150) NOT NULL,
       venue_address        varchar(300) NOT NULL,
       event_date           date NOT NULL,
       start_time           time(0) NOT NULL,
       end_time             time(0) NOT NULL,
       starts_at            timestamptz NOT NULL
         GENERATED ALWAYS AS ((event_date + start_time) AT TIME ZONE 'Asia/Kolkata') STORED,
       ends_at              timestamptz NOT NULL
         GENERATED ALWAYS AS (
           ((CASE WHEN end_time <= start_time THEN event_date + 1 ELSE event_date END) + end_time)
             AT TIME ZONE 'Asia/Kolkata'
         ) STORED,
       image_public_id      varchar(255),
       ticket_url           varchar(500),
       status               varchar(20) NOT NULL DEFAULT 'draft',
       is_verified          boolean NOT NULL DEFAULT false,
       verified_at          timestamptz,
       published_at         timestamptz,
       first_published_at   timestamptz,
       archived_at          timestamptz,
       created_by_admin_id  uuid NOT NULL REFERENCES admin_users (id) ON DELETE RESTRICT,
       updated_by_admin_id  uuid NOT NULL REFERENCES admin_users (id) ON DELETE RESTRICT,
       created_at           timestamptz NOT NULL DEFAULT now(),
       updated_at           timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT events_slug_unique UNIQUE (slug),
       CONSTRAINT events_slug_format_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
       -- The area must belong to the event's city.
       CONSTRAINT events_area_city_fk FOREIGN KEY (area_id, city_id)
         REFERENCES areas (id, city_id) ON DELETE RESTRICT,
       CONSTRAINT events_description_length_check CHECK (char_length(description) <= 5000),
       CONSTRAINT events_times_check CHECK (end_time <> start_time),
       CONSTRAINT events_ticket_url_check CHECK (ticket_url IS NULL OR ticket_url ~ '^https://'),
       CONSTRAINT events_status_check CHECK (status IN ('draft', 'published', 'archived')),
       CONSTRAINT events_published_check
         CHECK ((status = 'published') = (published_at IS NOT NULL)),
       CONSTRAINT events_first_published_check
         CHECK (published_at IS NULL OR first_published_at IS NOT NULL),
       CONSTRAINT events_archived_check CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
       CONSTRAINT events_verified_check CHECK (is_verified = (verified_at IS NOT NULL))
     )`,

    // Public listing: published, per city or across cities, ordered by start time.
    `CREATE INDEX events_published_city_starts_at_idx ON events (city_id, starts_at, id)
       WHERE status = 'published'`,
    `CREATE INDEX events_published_starts_at_idx ON events (starts_at, id)
       WHERE status = 'published'`,
    // Admin lists.
    `CREATE INDEX events_status_starts_at_idx ON events (status, starts_at, id)`,
    `CREATE INDEX events_created_at_idx ON events (created_at DESC, id DESC)`,
    // Foreign keys.
    `CREATE INDEX events_organizer_id_idx ON events (organizer_id, ends_at)`,
    `CREATE INDEX events_area_id_idx ON events (area_id) WHERE area_id IS NOT NULL`,
    `CREATE INDEX events_created_by_admin_id_idx ON events (created_by_admin_id)`,
    `CREATE INDEX events_updated_by_admin_id_idx ON events (updated_by_admin_id)`,
    updatedAtTrigger('events'),

    `COMMENT ON COLUMN events.venue_address IS 'Public venue address only — never a member location'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS events`]);
};
