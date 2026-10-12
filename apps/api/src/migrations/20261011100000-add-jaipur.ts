import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction } from '../lib/migration-helpers.js';

/**
 * Adds Jaipur (Rajasthan) and its neighbourhood-level areas to the cities members can choose
 * when creating or editing a profile. Same fixed-ID scheme as the launch cities
 * (`20260928100000-create-cities-and-areas`): Jaipur is city 7.
 *
 * Safe to run where Jaipur was already added by hand: the city insert does nothing on a
 * conflict, and the areas attach to whichever Jaipur row exists (looked up by slug).
 */
const CITY = { id: 'c1000000-0000-4000-8000-000000000007', name: 'Jaipur', state: 'Rajasthan' };
const AREAS = [
  'Malviya Nagar',
  'Vaishali Nagar',
  'Mansarovar',
  'C-Scheme',
  'Raja Park',
  'Jagatpura',
] as const;

const pad = (value: number, length: number) => String(value).padStart(length, '0');
const areaId = (area: number) => `a2000000-0007-4000-8000-${pad(area, 12)}`;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  const areaRows = AREAS.map(
    (name, i) => `('${areaId(i + 1)}', '${name}', '${slug(name)}', ${String(i + 1)})`,
  );

  await runInTransaction(sequelize, [
    `INSERT INTO cities (id, name, state, slug, sort_order)
     VALUES ('${CITY.id}', '${CITY.name}', '${CITY.state}', '${slug(CITY.name)}', 7)
     ON CONFLICT DO NOTHING`,

    `INSERT INTO areas (id, city_id, name, slug, sort_order)
     SELECT v.id::uuid, c.id, v.name, v.slug, v.sort_order
       FROM (VALUES ${areaRows.join(', ')}) AS v (id, name, slug, sort_order)
       JOIN cities c ON c.slug = '${slug(CITY.name)}'
     ON CONFLICT DO NOTHING`,
  ]);
};

/**
 * Removes Jaipur again. Fails on purpose (foreign key) if any profile or event already uses it:
 * a city people have chosen must be switched off with `is_active = false`, not deleted.
 */
export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `DELETE FROM areas WHERE city_id = '${CITY.id}'`,
    `DELETE FROM cities WHERE id = '${CITY.id}'`,
  ]);
};
