import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

const inList = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

const REASONS_BEFORE = [
  'underage',
  'safety_threat',
  'harassment',
  'sexual_content',
  'hate_speech',
  'scam_spam',
  'fake_profile',
  'other',
];
const REASONS_AFTER = [
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
/** Old reason → new reason. Stored priorities are kept as they were. */
const REASON_MAP_UP: readonly (readonly [string, string])[] = [
  ['safety_threat', 'threatening_behavior'],
  ['sexual_content', 'inappropriate_behavior'],
  ['hate_speech', 'harassment'],
  ['scam_spam', 'spam'],
];
/** Rollback mapping (lossy: new-only reasons fold into the closest old one). */
const REASON_MAP_DOWN: readonly (readonly [string, string])[] = [
  ['threatening_behavior', 'safety_threat'],
  ['inappropriate_behavior', 'sexual_content'],
  ['spam', 'scam_spam'],
  ['asking_for_money', 'scam_spam'],
  ['impersonation', 'fake_profile'],
];
const ACTIONS_BEFORE = ['dismiss', 'warn', 'suspend', 'ban'];
const ACTIONS_AFTER = ['dismiss', 'warn', 'restrict_chat', 'suspend', 'ban'];
const HIDDEN_BEFORE = ['p0_report', 'report_threshold', 'no_visible_photo'];
const HIDDEN_AFTER = [...HIDDEN_BEFORE, 'suspicious_activity'];

const remap = (pairs: readonly (readonly [string, string])[]) =>
  pairs.map(([from, to]) => `UPDATE reports SET reason = '${to}' WHERE reason = '${from}'`);

/**
 * Moderation system (docs/safety/moderation-system.md):
 * - the product's report reasons (existing reports are mapped to the closest new reason);
 * - the `restrict_chat` resolution action;
 * - at most one OPEN automated (system) report per member and detection trigger, so repeated
 *   detections update the queue instead of flooding it;
 * - `suspicious_activity` as a reason for hiding a member from discovery pending review.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE reports DROP CONSTRAINT reports_reason_check`,
    ...remap(REASON_MAP_UP),
    `ALTER TABLE reports ADD CONSTRAINT reports_reason_check
       CHECK (reason IN (${inList(REASONS_AFTER)}))`,
    `ALTER TABLE reports DROP CONSTRAINT reports_resolution_action_check`,
    `ALTER TABLE reports ADD CONSTRAINT reports_resolution_action_check
       CHECK (resolution_action IS NULL OR resolution_action IN (${inList(ACTIONS_AFTER)}))`,
    `CREATE UNIQUE INDEX reports_one_open_system_flag_unique
       ON reports (reported_user_id, (evidence ->> 'trigger'))
       WHERE source = 'system' AND status IN ('open', 'in_review')`,
    `CREATE INDEX reports_source_status_idx ON reports (source, status, priority, created_at)`,

    `ALTER TABLE users DROP CONSTRAINT users_hidden_reason_check`,
    `ALTER TABLE users ADD CONSTRAINT users_hidden_reason_check
       CHECK (hidden_reason IS NULL OR hidden_reason IN (${inList(HIDDEN_AFTER)}))`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE users DROP CONSTRAINT users_hidden_reason_check`,
    `UPDATE users SET hidden_reason = 'report_threshold' WHERE hidden_reason = 'suspicious_activity'`,
    `ALTER TABLE users ADD CONSTRAINT users_hidden_reason_check
       CHECK (hidden_reason IS NULL OR hidden_reason IN (${inList(HIDDEN_BEFORE)}))`,

    `DROP INDEX IF EXISTS reports_source_status_idx`,
    `DROP INDEX IF EXISTS reports_one_open_system_flag_unique`,
    `ALTER TABLE reports DROP CONSTRAINT reports_resolution_action_check`,
    `UPDATE reports SET resolution_action = 'warn' WHERE resolution_action = 'restrict_chat'`,
    `ALTER TABLE reports ADD CONSTRAINT reports_resolution_action_check
       CHECK (resolution_action IS NULL OR resolution_action IN (${inList(ACTIONS_BEFORE)}))`,
    `ALTER TABLE reports DROP CONSTRAINT reports_reason_check`,
    ...remap(REASON_MAP_DOWN),
    `ALTER TABLE reports ADD CONSTRAINT reports_reason_check
       CHECK (reason IN (${inList(REASONS_BEFORE)}))`,
  ]);
};
