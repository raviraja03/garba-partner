import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE user_profiles (
       id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       display_name   varchar(30) NOT NULL,
       date_of_birth  date NOT NULL,
       gender         varchar(20) NOT NULL,
       bio            varchar(300),
       experience     varchar(20) NOT NULL,
       styles         varchar(20)[] NOT NULL,
       created_at     timestamptz NOT NULL DEFAULT now(),
       updated_at     timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT user_profiles_user_id_unique UNIQUE (user_id),
       CONSTRAINT user_profiles_display_name_check
         CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 30),
       CONSTRAINT user_profiles_date_of_birth_check
         CHECK (date_of_birth >= DATE '1900-01-01'),
       CONSTRAINT user_profiles_gender_check
         CHECK (gender IN ('woman', 'man', 'non_binary')),
       CONSTRAINT user_profiles_experience_check
         CHECK (experience IN ('beginner', 'intermediate', 'advanced')),
       CONSTRAINT user_profiles_styles_check
         CHECK (cardinality(styles) >= 1
                AND styles <@ ARRAY['garba', 'dandiya_raas']::varchar(20)[])
     )`,

    updatedAtTrigger('user_profiles'),

    `COMMENT ON COLUMN user_profiles.date_of_birth IS 'Never exposed to other members; only the computed age is.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS user_profiles`]);
};
