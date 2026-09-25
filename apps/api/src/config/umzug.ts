import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Logger } from 'pino';
import type { Sequelize } from 'sequelize-typescript';
import { SequelizeStorage, Umzug, type MigrationFn } from 'umzug';
import type { ServerEnv } from '@garba-partner/config/server';

/** Context passed to every migration. */
export interface MigrationContext {
  sequelize: Sequelize;
}

/** Context passed to every seeder (seeders may need secrets, e.g. to hash phone numbers). */
export interface SeederContext {
  sequelize: Sequelize;
  env: ServerEnv;
}

export interface MigrationModule<TContext> {
  up: MigrationFn<TContext>;
  down: MigrationFn<TContext>;
}

/** `src/` in development (tsx), `dist/` when compiled. */
const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Matches both `.ts` (tsx) and compiled `.js` files, never declarations or tests. */
const MIGRATION_FILE_GLOB = '*.{ts,js}';
const IGNORED_FILES = ['**/*.d.ts', '**/*.test.*'];

/** Strip the extension so a migration keeps the same name in src (.ts) and dist (.js). */
function migrationName(filePath: string): string {
  return basename(filePath).replace(/\.(ts|js)$/, '');
}

function createRunner<TContext extends object>(options: {
  directory: 'migrations' | 'seeders';
  tableName: string;
  sequelize: Sequelize;
  context: TContext;
  logger: Logger;
}): Umzug<TContext> {
  return new Umzug<TContext>({
    migrations: {
      glob: [
        `${options.directory}/${MIGRATION_FILE_GLOB}`,
        { cwd: SOURCE_ROOT, ignore: IGNORED_FILES },
      ],
      resolve: ({ path, context }) => {
        if (!path) throw new Error('Migration path is missing');
        const load = () => import(pathToFileURL(path).href) as Promise<MigrationModule<TContext>>;
        return {
          name: migrationName(path),
          path,
          up: async () => (await load()).up({ name: migrationName(path), path, context }),
          down: async () => (await load()).down({ name: migrationName(path), path, context }),
        };
      },
    },
    context: options.context,
    storage: new SequelizeStorage({ sequelize: options.sequelize, tableName: options.tableName }),
    logger: {
      info: (event) => {
        options.logger.info(event, options.directory);
      },
      warn: (event) => {
        options.logger.warn(event, options.directory);
      },
      error: (event) => {
        options.logger.error(event, options.directory);
      },
      debug: (event) => {
        options.logger.debug(event, options.directory);
      },
    },
  });
}

/** Schema migrations, tracked in `schema_migrations`. */
export function createMigrator(sequelize: Sequelize, logger: Logger): Umzug<MigrationContext> {
  return createRunner({
    directory: 'migrations',
    tableName: 'schema_migrations',
    sequelize,
    context: { sequelize },
    logger,
  });
}

/** Development seeders, tracked in `schema_seeders`. */
export function createSeeder(
  sequelize: Sequelize,
  env: ServerEnv,
  logger: Logger,
): Umzug<SeederContext> {
  return createRunner({
    directory: 'seeders',
    tableName: 'schema_seeders',
    sequelize,
    context: { sequelize, env },
    logger,
  });
}
