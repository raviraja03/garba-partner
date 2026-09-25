import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE user_preferences (
       id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id                     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       partner_gender_preference   varchar(20) NOT NULL DEFAULT 'everyone',
       age_min                     smallint NOT NULL DEFAULT 18,
       age_max                     smallint NOT NULL DEFAULT 80,
       discovery_enabled           boolean NOT NULL DEFAULT false,
       show_area                   boolean NOT NULL DEFAULT false,
       created_at                  timestamptz NOT NULL DEFAULT now(),
       updated_at                  timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT user_preferences_user_id_unique UNIQUE (user_id),
       CONSTRAINT user_preferences_partner_gender_preference_check
         CHECK (partner_gender_preference IN ('women', 'men', 'everyone')),
       CONSTRAINT user_preferences_age_range_check
         CHECK (age_min >= 18 AND age_max <= 80 AND age_min <= age_max)
     )`,

    // Discovery only ever scans members who opted in.
    `CREATE INDEX user_preferences_discovery_enabled_idx ON user_preferences (user_id)
       WHERE discovery_enabled`,

    updatedAtTrigger('user_preferences'),

    `COMMENT ON COLUMN user_preferences.discovery_enabled IS 'Explicit opt-in to partner discovery. Default false (privacy by default).'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS user_preferences`]);
};
