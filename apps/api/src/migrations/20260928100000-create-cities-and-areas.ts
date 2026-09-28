import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

/**
 * Launch cities and neighbourhood-level areas (never street level). Reference data lives in the
 * migration so every environment, including production, gets the same fixed IDs. Later changes
 * are new migrations (or the admin locations screens once they exist).
 */
const CITIES: readonly { index: number; name: string; state: string; areas: readonly string[] }[] =
  [
    {
      index: 1,
      name: 'Ahmedabad',
      state: 'Gujarat',
      areas: ['Navrangpura', 'Satellite', 'Bodakdev', 'Maninagar', 'Vastrapur', 'Chandkheda'],
    },
    {
      index: 2,
      name: 'Vadodara',
      state: 'Gujarat',
      areas: ['Alkapuri', 'Manjalpur', 'Gotri', 'Karelibaug', 'Akota'],
    },
    {
      index: 3,
      name: 'Surat',
      state: 'Gujarat',
      areas: ['Adajan', 'Vesu', 'Athwalines', 'Varachha', 'Piplod'],
    },
    {
      index: 4,
      name: 'Mumbai',
      state: 'Maharashtra',
      areas: ['Borivali', 'Ghatkopar', 'Andheri', 'Kandivali', 'Malad', 'Mulund'],
    },
    {
      index: 5,
      name: 'Pune',
      state: 'Maharashtra',
      areas: ['Kothrud', 'Baner', 'Aundh', 'Viman Nagar', 'Hadapsar'],
    },
    {
      index: 6,
      name: 'Bengaluru',
      state: 'Karnataka',
      areas: ['Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout', 'Jayanagar'],
    },
  ];

const pad = (value: number, length: number) => String(value).padStart(length, '0');
const cityId = (index: number) => `c1000000-0000-4000-8000-${pad(index, 12)}`;
const areaId = (city: number, area: number) =>
  `a2000000-${pad(city, 4)}-4000-8000-${pad(area, 12)}`;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  const cityRows = CITIES.map(
    (city) =>
      `(${quote(cityId(city.index))}, ${quote(city.name)}, ${quote(city.state)}, ${quote(slug(city.name))}, ${String(city.index)})`,
  );
  const areaRows = CITIES.flatMap((city) =>
    city.areas.map(
      (name, i) =>
        `(${quote(areaId(city.index, i + 1))}, ${quote(cityId(city.index))}, ${quote(name)}, ${quote(slug(name))}, ${String(i + 1)})`,
    ),
  );

  await runInTransaction(sequelize, [
    `CREATE TABLE cities (
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       name        varchar(80) NOT NULL,
       state       varchar(80) NOT NULL,
       slug        varchar(100) NOT NULL,
       is_active   boolean NOT NULL DEFAULT true,
       sort_order  smallint NOT NULL DEFAULT 0,
       created_at  timestamptz NOT NULL DEFAULT now(),
       updated_at  timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT cities_slug_unique UNIQUE (slug),
       CONSTRAINT cities_name_state_unique UNIQUE (name, state),
       CONSTRAINT cities_slug_format_check CHECK (slug ~ '^[a-z0-9-]+$')
     )`,

    `CREATE TABLE areas (
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       city_id     uuid NOT NULL REFERENCES cities (id) ON DELETE RESTRICT,
       name        varchar(80) NOT NULL,
       slug        varchar(100) NOT NULL,
       is_active   boolean NOT NULL DEFAULT true,
       sort_order  smallint NOT NULL DEFAULT 0,
       created_at  timestamptz NOT NULL DEFAULT now(),
       updated_at  timestamptz NOT NULL DEFAULT now(),

       CONSTRAINT areas_city_id_slug_unique UNIQUE (city_id, slug),
       -- Target of the composite FK that guarantees a profile's area belongs to its city.
       CONSTRAINT areas_id_city_id_unique UNIQUE (id, city_id),
       CONSTRAINT areas_slug_format_check CHECK (slug ~ '^[a-z0-9-]+$')
     )`,

    `CREATE INDEX cities_active_sort_idx ON cities (sort_order) WHERE is_active`,
    `CREATE INDEX areas_city_id_active_idx ON areas (city_id, sort_order) WHERE is_active`,

    updatedAtTrigger('cities'),
    updatedAtTrigger('areas'),

    `INSERT INTO cities (id, name, state, slug, sort_order) VALUES ${cityRows.join(', ')}`,
    `INSERT INTO areas (id, city_id, name, slug, sort_order) VALUES ${areaRows.join(', ')}`,

    `COMMENT ON TABLE areas IS 'Neighbourhood-level areas only. Never street-level or exact locations.'`,
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS areas`, `DROP TABLE IF EXISTS cities`]);
};
