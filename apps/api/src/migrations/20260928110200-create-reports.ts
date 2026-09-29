import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

/**
 * Reports about members (docs/safety/moderation-system.md). `source = 'system'` reports are raised by the
 * platform itself (e.g. an identity check showing the member is under 18) and have no reporter.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE reports (
       id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       source                varchar(10) NOT NULL DEFAULT 'member',
       reporter_id           uuid REFERENCES users (id) ON DELETE SET NULL,
       reported_user_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
       reason                varchar(30) NOT NULL,
       priority              smallint NOT NULL,
       details               varchar(1000),
       evidence              jsonb NOT NULL DEFAULT '{}'::jsonb,
       status                varchar(20) NOT NULL DEFAULT 'open',
       assigned_admin_id     uuid REFERENCES admin_users (id) ON DELETE RESTRICT,
       resolution_action     varchar(20),
       resolution_note       text,
       resolved_by_admin_id  uuid REFERENCES admin_users (id) ON DELETE RESTRICT,
       resolved_at           timestamptz,
       created_at            timestamptz NOT NULL DEFAULT now(),
       updated_at            timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT reports_source_check CHECK (source IN ('member', 'system')),
       CONSTRAINT reports_not_self_check CHECK (reporter_id IS NULL OR reporter_id <> reported_user_id),
       CONSTRAINT reports_reason_check CHECK (reason IN
         ('underage', 'safety_threat', 'harassment', 'sexual_content', 'hate_speech',
          'scam_spam', 'fake_profile', 'other')),
       CONSTRAINT reports_priority_check CHECK (priority BETWEEN 0 AND 2),
       CONSTRAINT reports_status_check CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
       CONSTRAINT reports_resolution_action_check
         CHECK (resolution_action IS NULL OR resolution_action IN ('dismiss', 'warn', 'suspend', 'ban')),
       CONSTRAINT reports_resolution_consistency_check CHECK (
         (status IN ('resolved', 'dismissed'))
           = (resolution_action IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by_admin_id IS NOT NULL)
       )
     )`,

    // One open report per reporter and reported member (duplicates are merged by the API).
    `CREATE UNIQUE INDEX reports_one_open_per_pair_unique ON reports (reporter_id, reported_user_id)
       WHERE status IN ('open', 'in_review') AND reporter_id IS NOT NULL`,
    // Moderation queue: most urgent first, then oldest.
    `CREATE INDEX reports_queue_idx ON reports (status, priority, created_at, id)`,
    `CREATE INDEX reports_reported_user_id_created_at_idx ON reports (reported_user_id, created_at DESC)`,
    `CREATE INDEX reports_reporter_id_created_at_idx ON reports (reporter_id, created_at DESC)
       WHERE reporter_id IS NOT NULL`,

    updatedAtTrigger('reports'),

    `COMMENT ON COLUMN reports.evidence IS 'Snapshot of the reported public profile at report time (public fields only).'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS reports`]);
};
