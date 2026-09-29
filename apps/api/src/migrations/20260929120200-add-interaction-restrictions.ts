import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

const TARGET_TYPES_BEFORE = [
  'user',
  'admin',
  'report',
  'event',
  'verification',
  'photo',
  'city',
  'area',
  'sanction',
  'organizer',
];
const inList = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/**
 * Admin safety restriction (docs/matching/matches.md#admin-moderation): a restricted member
 * can still use the app but cannot send or accept interests. Admin actions on matches are
 * audited with target_type 'match'.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE users ADD COLUMN interactions_restricted_at timestamptz`,
    `ALTER TABLE admin_audit_logs DROP CONSTRAINT admin_audit_logs_target_type_check`,
    `ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_target_type_check
       CHECK (target_type IN (${inList([...TARGET_TYPES_BEFORE, 'match'])}))`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    // Audit entries are append-only: existing 'match' rows are kept (NOT VALID skips them).
    `ALTER TABLE admin_audit_logs DROP CONSTRAINT admin_audit_logs_target_type_check`,
    `ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_target_type_check
       CHECK (target_type IN (${inList(TARGET_TYPES_BEFORE)})) NOT VALID`,
    `ALTER TABLE users DROP COLUMN interactions_restricted_at`,
  ]);
};
