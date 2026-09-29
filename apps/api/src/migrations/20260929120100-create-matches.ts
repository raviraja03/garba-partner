import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

/**
 * Matches (docs/matching/matches.md): created when an interest is accepted (or both members sent
 * one). Exactly one match per pair is enforced by the DATABASE:
 * - member IDs are stored in canonical order (`user_a_id < user_b_id`), so (A, B) and (B, A)
 *   are the same row key;
 * - at most one ACTIVE match per pair (partial unique index);
 * - an interest can produce at most one match (`interest_id` unique).
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE matches (
       id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_a_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       user_b_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       interest_id        uuid REFERENCES partner_interests (id) ON DELETE SET NULL,
       event_id           uuid REFERENCES events (id) ON DELETE SET NULL,
       status             varchar(20) NOT NULL DEFAULT 'active',
       ended_at           timestamptz,
       ended_by_user_id   uuid REFERENCES users (id) ON DELETE SET NULL,
       ended_by_admin_id  uuid REFERENCES admin_users (id) ON DELETE RESTRICT,
       created_at         timestamptz NOT NULL DEFAULT now(),
       updated_at         timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT matches_canonical_order_check CHECK (user_a_id < user_b_id),
       CONSTRAINT matches_interest_unique UNIQUE (interest_id),
       CONSTRAINT matches_status_check CHECK (status IN ('active', 'unmatched', 'blocked', 'closed')),
       CONSTRAINT matches_ended_check CHECK ((status = 'active') = (ended_at IS NULL))
     )`,

    `CREATE UNIQUE INDEX matches_one_active_per_pair_unique ON matches (user_a_id, user_b_id)
       WHERE status = 'active'`,
    // Each member's match list (either side of the pair).
    `CREATE INDEX matches_user_a_created_at_idx ON matches (user_a_id, created_at DESC, id DESC)`,
    `CREATE INDEX matches_user_b_created_at_idx ON matches (user_b_id, created_at DESC, id DESC)`,
    `CREATE INDEX matches_event_id_idx ON matches (event_id) WHERE event_id IS NOT NULL`,
    `CREATE INDEX matches_ended_by_admin_id_idx ON matches (ended_by_admin_id)
       WHERE ended_by_admin_id IS NOT NULL`,
    updatedAtTrigger('matches'),

    `COMMENT ON COLUMN matches.ended_by_user_id IS 'Internal only: never exposed to the other member'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS matches`]);
};
