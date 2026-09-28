import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/** First launch city (Ahmedabad) — see 20260928100000-create-cities-and-areas. */
const BACKFILL_CITY_ID = 'c1000000-0000-4000-8000-000000000001';

/**
 * Profile fields for the profile system (docs/users/user-profile.md):
 * - `experience` → `garba_level`; the unused `styles` column is removed.
 * - city/area (area must belong to the city — composite FK), Instagram handle, available dates,
 *   and the profile image reference (Cloudinary public ID; the file itself lives in Cloudinary).
 * Pre-launch only: existing rows (development data) are backfilled with the first launch city.
 */
export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `ALTER TABLE user_profiles RENAME COLUMN experience TO garba_level`,
    `ALTER TABLE user_profiles RENAME CONSTRAINT user_profiles_experience_check
       TO user_profiles_garba_level_check`,
    `ALTER TABLE user_profiles DROP CONSTRAINT user_profiles_styles_check`,
    `ALTER TABLE user_profiles DROP COLUMN styles`,

    `ALTER TABLE user_profiles
       ADD COLUMN city_id            uuid REFERENCES cities (id) ON DELETE RESTRICT,
       ADD COLUMN area_id            uuid,
       ADD COLUMN instagram_handle   varchar(30),
       ADD COLUMN available_dates    date[] NOT NULL DEFAULT '{}',
       ADD COLUMN image_public_id    varchar(255),
       ADD COLUMN image_width        integer,
       ADD COLUMN image_height       integer,
       ADD COLUMN image_uploaded_at  timestamptz`,

    `UPDATE user_profiles SET city_id = '${BACKFILL_CITY_ID}' WHERE city_id IS NULL`,
    `ALTER TABLE user_profiles ALTER COLUMN city_id SET NOT NULL`,

    `ALTER TABLE user_profiles
       ADD CONSTRAINT user_profiles_area_in_city_fkey
         FOREIGN KEY (area_id, city_id) REFERENCES areas (id, city_id) ON DELETE RESTRICT,
       ADD CONSTRAINT user_profiles_instagram_handle_check
         CHECK (instagram_handle IS NULL OR instagram_handle ~ '^[a-z0-9._]{1,30}$'),
       ADD CONSTRAINT user_profiles_available_dates_check
         CHECK (cardinality(available_dates) <= 30),
       ADD CONSTRAINT user_profiles_image_consistency_check CHECK (
         (image_public_id IS NULL AND image_width IS NULL AND image_height IS NULL
            AND image_uploaded_at IS NULL)
         OR (image_public_id IS NOT NULL AND image_width > 0 AND image_height > 0
            AND image_uploaded_at IS NOT NULL)
       )`,

    `CREATE UNIQUE INDEX user_profiles_image_public_id_unique ON user_profiles (image_public_id)
       WHERE image_public_id IS NOT NULL`,
    `CREATE INDEX user_profiles_city_id_idx ON user_profiles (city_id)`,
    `CREATE INDEX user_profiles_area_id_idx ON user_profiles (area_id) WHERE area_id IS NOT NULL`,

    `COMMENT ON COLUMN user_profiles.instagram_handle IS 'Private: never shown to other members before matching.'`,
    `COMMENT ON COLUMN user_profiles.image_public_id IS 'Cloudinary public ID of the processed (EXIF-free) profile image.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `DROP INDEX IF EXISTS user_profiles_area_id_idx`,
    `DROP INDEX IF EXISTS user_profiles_city_id_idx`,
    `DROP INDEX IF EXISTS user_profiles_image_public_id_unique`,
    `ALTER TABLE user_profiles
       DROP CONSTRAINT IF EXISTS user_profiles_image_consistency_check,
       DROP CONSTRAINT IF EXISTS user_profiles_available_dates_check,
       DROP CONSTRAINT IF EXISTS user_profiles_instagram_handle_check,
       DROP CONSTRAINT IF EXISTS user_profiles_area_in_city_fkey`,
    `ALTER TABLE user_profiles
       DROP COLUMN image_uploaded_at,
       DROP COLUMN image_height,
       DROP COLUMN image_width,
       DROP COLUMN image_public_id,
       DROP COLUMN available_dates,
       DROP COLUMN instagram_handle,
       DROP COLUMN area_id,
       DROP COLUMN city_id`,
    `ALTER TABLE user_profiles ADD COLUMN styles varchar(20)[] NOT NULL DEFAULT ARRAY['garba']::varchar(20)[]`,
    `ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_styles_check
       CHECK (cardinality(styles) >= 1 AND styles <@ ARRAY['garba', 'dandiya_raas']::varchar(20)[])`,
    `ALTER TABLE user_profiles RENAME CONSTRAINT user_profiles_garba_level_check
       TO user_profiles_experience_check`,
    `ALTER TABLE user_profiles RENAME COLUMN garba_level TO experience`,
  ]);
};
