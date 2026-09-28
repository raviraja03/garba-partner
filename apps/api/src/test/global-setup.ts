import { pino } from 'pino';
import { createSequelize } from '../config/database.js';
import { createMigrator } from '../config/umzug.js';

/**
 * Runs once before the test suite: rebuilds the integration-test schema by migrating every
 * migration DOWN and then UP (so `down` functions are exercised on every run).
 * Skipped when TEST_DATABASE_URL is not configured.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;

  const sequelize = createSequelize({ url, ssl: false, poolMax: 1 });
  try {
    const migrator = createMigrator(sequelize, pino({ level: 'silent' }));
    await migrator.up();
    await migrator.down({ to: 0 });
    await migrator.up();
  } finally {
    await sequelize.close();
  }
}
