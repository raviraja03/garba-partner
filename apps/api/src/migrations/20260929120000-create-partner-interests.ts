import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

/**
 * Partner interests (docs/matching/interests.md): a request → accept model. The receiver decides
 * whether a match (and later a chat) happens.
 *
 * Duplicate prevention is enforced by the DATABASE, not only the service:
 * - at most ONE pending interest per UNORDERED pair (A→B and B→A can't both be pending), so two
 *   members sending to each other at the same time can never produce two pending rows;
 * - a member can't send an interest to themselves;
 * - `responded_at` is set exactly when the interest leaves `pending`.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE partner_interests (
       id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       sender_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       receiver_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       event_id      uuid REFERENCES events (id) ON DELETE SET NULL,
       status        varchar(20) NOT NULL DEFAULT 'pending',
       expires_at    timestamptz NOT NULL,
       responded_at  timestamptz,
       created_at    timestamptz NOT NULL DEFAULT now(),
       updated_at    timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT partner_interests_not_self_check CHECK (sender_id <> receiver_id),
       CONSTRAINT partner_interests_status_check
         CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'cancelled', 'expired')),
       CONSTRAINT partner_interests_responded_check
         CHECK ((status = 'pending') = (responded_at IS NULL)),
       CONSTRAINT partner_interests_expiry_check CHECK (expires_at > created_at)
     )`,

    // One pending interest per unordered pair.
    `CREATE UNIQUE INDEX partner_interests_one_pending_per_pair_unique
       ON partner_interests (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id))
       WHERE status = 'pending'`,
    // Received / Sent lists.
    `CREATE INDEX partner_interests_receiver_pending_idx
       ON partner_interests (receiver_id, created_at DESC, id DESC) WHERE status = 'pending'`,
    `CREATE INDEX partner_interests_sender_pending_idx
       ON partner_interests (sender_id, created_at DESC, id DESC) WHERE status = 'pending'`,
    // Daily limit (rolling 24 h).
    `CREATE INDEX partner_interests_sender_created_at_idx
       ON partner_interests (sender_id, created_at DESC)`,
    // Decline cooldown (discovery and send checks).
    `CREATE INDEX partner_interests_declined_idx
       ON partner_interests (sender_id, receiver_id, responded_at) WHERE status = 'declined'`,
    `CREATE INDEX partner_interests_event_id_idx ON partner_interests (event_id)
       WHERE event_id IS NOT NULL`,
    updatedAtTrigger('partner_interests'),

    `COMMENT ON TABLE partner_interests IS 'Declines are never revealed to the sender.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS partner_interests`]);
};
