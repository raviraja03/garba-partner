import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Extra profile photos (docs/users/user-profile.md#photos).
 *
 * The MAIN photo stays on `user_profiles.image_public_id`: it is the one on cards, in chats and
 * in search, and the one photo verification refers to. This table holds the additional photos a
 * member adds to their profile page, oldest first.
 *
 * - `public_id` is the opaque storage ID (same storage and processing as the main photo).
 * - The per-member limit (`LIMITS.PROFILE_EXTRA_PHOTOS_MAX`) is enforced by the service under a
 *   row lock on the profile.
 * - Rows are removed with the user (hard delete on account erasure).
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE user_profile_photos (
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       public_id   varchar(255) NOT NULL,
       width       integer NOT NULL,
       height      integer NOT NULL,
       created_at  timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT user_profile_photos_dimensions_check CHECK (width > 0 AND height > 0)
     )`,
    `CREATE UNIQUE INDEX user_profile_photos_public_id_unique ON user_profile_photos (public_id)`,
    // A member's photos in display order.
    `CREATE INDEX user_profile_photos_user_created_idx ON user_profile_photos (user_id, created_at)`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS user_profile_photos`]);
};
