import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

const AUDIT_TARGET_TYPES_BEFORE = [
  'user',
  'admin',
  'report',
  'event',
  'verification',
  'photo',
  'city',
  'area',
  'sanction',
];
const inList = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/**
 * Event organizers (docs/events/organizer-management.md). Public fields (name, description,
 * website, Instagram) are shown on event pages; contact fields and notes are PRIVATE (admin only).
 * Organizers are archived, never deleted, because events reference them.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE event_organizers (
       id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       name                 varchar(150) NOT NULL,
       description          varchar(1000),
       website_url          varchar(500),
       instagram_handle     varchar(30),
       contact_name         varchar(100),
       contact_email        varchar(254),
       contact_phone        varchar(40),
       notes                varchar(2000),
       status               varchar(20) NOT NULL DEFAULT 'active',
       is_verified          boolean NOT NULL DEFAULT false,
       verified_at          timestamptz,
       archived_at          timestamptz,
       created_by_admin_id  uuid NOT NULL REFERENCES admin_users (id) ON DELETE RESTRICT,
       updated_by_admin_id  uuid NOT NULL REFERENCES admin_users (id) ON DELETE RESTRICT,
       created_at           timestamptz NOT NULL DEFAULT now(),
       updated_at           timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT event_organizers_status_check CHECK (status IN ('active', 'archived')),
       CONSTRAINT event_organizers_archived_check
         CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
       CONSTRAINT event_organizers_verified_check
         CHECK (is_verified = (verified_at IS NOT NULL)),
       CONSTRAINT event_organizers_website_url_check
         CHECK (website_url IS NULL OR website_url ~ '^https://'),
       CONSTRAINT event_organizers_instagram_handle_check
         CHECK (instagram_handle IS NULL OR instagram_handle ~ '^[a-z0-9._]+$')
     )`,

    // One organizer per name (case-insensitive) prevents duplicates and look-alike listings.
    `CREATE UNIQUE INDEX event_organizers_name_unique ON event_organizers (lower(name))`,
    `CREATE INDEX event_organizers_status_name_idx ON event_organizers (status, name, id)`,
    `CREATE INDEX event_organizers_created_by_admin_id_idx ON event_organizers (created_by_admin_id)`,
    `CREATE INDEX event_organizers_updated_by_admin_id_idx ON event_organizers (updated_by_admin_id)`,
    updatedAtTrigger('event_organizers'),

    `COMMENT ON COLUMN event_organizers.contact_name IS 'PRIVATE: admin only, never returned by public APIs'`,
    `COMMENT ON COLUMN event_organizers.contact_email IS 'PRIVATE: admin only, never returned by public APIs'`,
    `COMMENT ON COLUMN event_organizers.contact_phone IS 'PRIVATE: admin only, never returned by public APIs'`,
    `COMMENT ON COLUMN event_organizers.notes IS 'PRIVATE: internal admin notes'`,

    // Admin actions on organizers are audited with target_type 'organizer'.
    `ALTER TABLE admin_audit_logs DROP CONSTRAINT admin_audit_logs_target_type_check`,
    `ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_target_type_check
       CHECK (target_type IN (${inList([...AUDIT_TARGET_TYPES_BEFORE, 'organizer'])}))`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    // Audit entries are append-only, so existing 'organizer' rows are kept (NOT VALID skips them).
    `ALTER TABLE admin_audit_logs DROP CONSTRAINT admin_audit_logs_target_type_check`,
    `ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_target_type_check
       CHECK (target_type IN (${inList(AUDIT_TARGET_TYPES_BEFORE)})) NOT VALID`,
    `DROP TABLE IF EXISTS event_organizers`,
  ]);
};
