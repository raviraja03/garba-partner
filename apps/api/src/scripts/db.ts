import type { Logger } from 'pino';
import type { Sequelize } from 'sequelize-typescript';
import type { ServerEnv } from '@garba-partner/config/server';
import { createSequelize, databaseConfigFromEnv } from '../config/database.js';
import { readEnv } from '../config/env.js';
import { createMigrator, createSeeder } from '../config/umzug.js';
import { createLogger } from '../lib/logger.js';

/**
 * Database CLI: `tsx src/scripts/db.ts <command>` (dev) or `node dist/scripts/db.js <command>`.
 * See docs/database/migration-guide.md.
 */
const COMMANDS = {
  migrate: 'Apply all pending migrations',
  'migrate:undo': 'Revert the most recent migration',
  'migrate:undo:all': 'Revert all migrations (development only)',
  'migrate:status': 'List executed and pending migrations',
  seed: 'Run pending development seeders (development only)',
  'seed:undo': 'Revert all development seeders (development only)',
  reset: 'Undo seeds and migrations, then migrate and seed again (development only)',
} as const;

type Command = keyof typeof COMMANDS;

/** Never allowed when APP_ENV=production. */
const DEVELOPMENT_ONLY = new Set<Command>(['migrate:undo:all', 'seed', 'seed:undo', 'reset']);
/** Allowed in production only with an explicit confirmation flag. */
const REQUIRES_PRODUCTION_CONFIRMATION = new Set<Command>(['migrate:undo']);
const CONFIRM_PRODUCTION_FLAG = '--confirm-production';

function isCommand(value: string | undefined): value is Command {
  return value !== undefined && Object.hasOwn(COMMANDS, value);
}

function usage(): string {
  const lines = Object.entries(COMMANDS).map(
    ([name, description]) => `  ${name.padEnd(18)}${description}`,
  );
  return `Usage: db <command>\n\nCommands:\n${lines.join('\n')}\n`;
}

function assertAllowed(command: Command, env: ServerEnv, args: readonly string[]): void {
  if (env.APP_ENV !== 'production') return;
  if (DEVELOPMENT_ONLY.has(command)) {
    throw new Error(`"${command}" is disabled when APP_ENV=production`);
  }
  if (REQUIRES_PRODUCTION_CONFIRMATION.has(command) && !args.includes(CONFIRM_PRODUCTION_FLAG)) {
    throw new Error(
      `"${command}" in production requires ${CONFIRM_PRODUCTION_FLAG} (take a backup first)`,
    );
  }
}

async function clearSeederLog(sequelize: Sequelize): Promise<void> {
  await sequelize.query('DELETE FROM schema_seeders');
}

async function run(command: Command, env: ServerEnv, logger: Logger, sequelize: Sequelize) {
  const migrator = createMigrator(sequelize, logger);
  const seeder = createSeeder(sequelize, env, logger);

  const assertSchemaUpToDate = async () => {
    const pending = await migrator.pending();
    if (pending.length > 0) {
      throw new Error(`${String(pending.length)} pending migration(s). Run db:migrate first.`);
    }
  };

  switch (command) {
    case 'migrate':
      await migrator.up();
      break;
    case 'migrate:undo':
      await migrator.down();
      break;
    case 'migrate:undo:all':
      await migrator.down({ to: 0 });
      // Seed data disappeared with the tables, so forget that seeders ran.
      // (`executed()` creates the seeder log table if it does not exist yet.)
      await seeder.executed();
      await clearSeederLog(sequelize);
      break;
    case 'migrate:status': {
      const [executed, pending] = await Promise.all([migrator.executed(), migrator.pending()]);
      logger.info(
        { executed: executed.map((m) => m.name), pending: pending.map((m) => m.name) },
        'Migration status',
      );
      break;
    }
    case 'seed':
      await assertSchemaUpToDate();
      await seeder.up();
      break;
    case 'seed:undo':
      await seeder.down({ to: 0 });
      break;
    case 'reset':
      // Bring the schema up to date first so seeders can always be reverted cleanly.
      await migrator.up();
      await seeder.down({ to: 0 });
      await migrator.down({ to: 0 });
      await clearSeederLog(sequelize);
      await migrator.up();
      await seeder.up();
      break;
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!isCommand(command)) {
    process.stderr.write(usage());
    process.exitCode = 1;
    return;
  }

  const env = readEnv();
  const logger = createLogger(env);
  assertAllowed(command, env, args);

  // Migrations may use a more privileged role than the running API (least privilege).
  const sequelize = createSequelize({
    ...databaseConfigFromEnv(env),
    url: env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL,
    poolMax: 1,
  });

  try {
    await sequelize.authenticate();
    await run(command, env, logger, sequelize);
    logger.info({ command }, 'Done');
  } finally {
    await sequelize.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`db: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
