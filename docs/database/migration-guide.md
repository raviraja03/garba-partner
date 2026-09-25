# Migration Guide

> Related: [Schema](schema.md), [Database setup](database-setup.md), [Development rules §5](../development/development-rules.md#5-database-change-process)

**Every schema change is a migration.** `sequelize.sync()` is never used. Migrations and seeders are TypeScript files run by [Umzug](https://github.com/sequelize/umzug) through `apps/api/src/scripts/db.ts`.

## 1. Commands

Run from the repository root (or inside `apps/api` without the `-w` proxy):

| Command | What it does | Production |
|---|---|---|
| `npm run db:migrate` | Apply all pending migrations | ✅ (via `db:migrate:prod`, see §6) |
| `npm run db:migrate:undo` | Revert the most recent migration | Only with `--confirm-production` |
| `npm run db:migrate:undo:all` | Revert every migration (also clears the seeder log) | ❌ blocked |
| `npm run db:migrate:status` | List executed and pending migrations | ✅ |
| `npm run db:seed` | Run pending development seeders (refuses if migrations are pending) | ❌ blocked |
| `npm run db:seed:undo` | Revert all development seeders | ❌ blocked |
| `npm run db:reset` | Migrate → undo seeds → undo all migrations → migrate → seed | ❌ blocked |

"Blocked" means the CLI refuses when `APP_ENV=production`. Each seeder also refuses on its own.

The CLI connects with `DATABASE_MIGRATION_URL` if set (an owner role), otherwise with `DATABASE_URL`.

## 2. Files and naming

```text
apps/api/src/
├── migrations/
│   ├── 20260925100000-create-users.ts
│   ├── 20260925100100-create-user-profiles.ts
│   ├── 20260925100200-create-user-preferences.ts
│   ├── 20260925100300-create-user-sessions.ts
│   └── 20260925100400-create-user-verifications.ts
├── seeders/
│   └── 20260925110000-dev-users.ts
├── config/umzug.ts          # migrator + seeder factories
└── scripts/db.ts            # CLI
```

- Name: `YYYYMMDDHHmmss-kebab-description.ts` (UTC). Order is lexical, so timestamps must increase.
- The stored name drops the extension, so a migration is recorded identically whether it ran from `src/*.ts` (tsx) or `dist/*.js` (compiled).
- Applied names are stored in `schema_migrations` and `schema_seeders`.

## 3. Writing a migration

Template:

```ts
import type { MigrationFn } from 'umzug';
import type { MigrationContext } from '../config/umzug.js';
import { runInTransaction, updatedAtTrigger } from '../lib/migration-helpers.js';

export const up: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [
    `CREATE TABLE things (
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       status      varchar(20) NOT NULL DEFAULT 'draft',
       created_at  timestamptz NOT NULL DEFAULT now(),
       updated_at  timestamptz NOT NULL DEFAULT now(),
       CONSTRAINT things_status_check CHECK (status IN ('draft', 'published'))
     )`,
    `CREATE INDEX things_user_id_idx ON things (user_id)`,
    updatedAtTrigger('things'),
  ]);
};

export const down: MigrationFn<MigrationContext> = async ({ context: { sequelize } }) => {
  await runInTransaction(sequelize, [`DROP TABLE IF EXISTS things`]);
};
```

Rules:

1. **Transactional.** Use `runInTransaction` so a failing migration leaves nothing half-applied (PostgreSQL DDL is transactional). The exception is `CREATE INDEX CONCURRENTLY`, which can't run in a transaction: put it in its own migration and call `sequelize.query` directly.
2. **Hard-code values.** Don't import enums or limits from `@garba-partner/shared` into migrations. A migration is a historical snapshot and must behave the same forever.
3. **Always write a working `down`**, and test it (§5).
4. **Constraints in the database:** NOT NULL, FKs with explicit `ON DELETE`, CHECKs for enumerations and invariants, UNIQUE (partial where appropriate), and indexes for every foreign key or filter used by a query.
5. **Every table** gets `id uuid`, `created_at`, `updated_at` and the `updated_at` trigger.
6. **Never edit a migration that has run anywhere shared** (another developer, CI, staging, production). Write a new migration instead.
7. **Keep releases rollback-safe (expand → migrate → contract).** Add columns as nullable or with defaults first, backfill, then tighten in a later release. Drop columns only after the code stopped using them for one release.
8. **No personal data in migrations** (no data fixes with real values). Data fixes are reviewed migrations using IDs, never names or phone numbers.
9. Update the model, [schema.md](schema.md) (and the ERD), [relationships.md](relationships.md) if relations changed, and `packages/shared` enums **in the same PR**.

### Changing an enumeration

Example: adding a verification provider (requires legal review first).

1. Add the value to `packages/shared/src/constants/enums.ts`.
2. New migration: `ALTER TABLE user_verifications DROP CONSTRAINT user_verifications_provider_check, ADD CONSTRAINT user_verifications_provider_check CHECK (provider IN ('internal_review', 'new_provider'))`. The `down` restores the old list.
3. Update schema.md.

## 4. Seeders

- Seeders are for **development data only**. Each checks `APP_ENV !== 'production'`, and so does the CLI.
- Use fictional people, obviously fake phone numbers (`+9199999xxxxx`), no real photos and no identity documents.
- Use fixed UUIDs, so `down` can remove exactly what `up` inserted.
- Insert through **models** inside one transaction, so model validation also checks the seed data.
- Seeders need `PHONE_HASH_SECRET` and `PHONE_ENCRYPTION_KEY` (users can't exist without phone data).
- Reference data that production needs (e.g. cities) will get its own idempotent seeder that *is* allowed in production. It will be introduced with the locations phase.

Current seeder `20260925110000-dev-users` creates 8 fictional users covering: verified, pending and rejected verification, not discoverable, onboarding incomplete, suspended, and pending deletion. It also creates two example sessions (one active, one revoked).

## 5. Testing migrations

- `src/models/models.int.test.ts` runs **up → down (all) → up** against `TEST_DATABASE_URL`, then checks constraints, cascades and model behaviour. It runs in `npm run test` when `TEST_DATABASE_URL` is set, and is skipped otherwise.
- Before opening a PR with a migration, run locally:

```bash
npm run db:migrate
npm run db:migrate:undo      # repeat for each new migration
npm run db:migrate
npm run db:reset             # full cycle including seeds
npm run test
```

## 6. Production

1. **Take a backup** (`pg_dump -Fc`) before every deploy that includes migrations.
2. Build, then run `npm run db:migrate:prod -w @garba-partner/api` (compiled `dist/scripts/db.js migrate`) with `DATABASE_MIGRATION_URL` pointing at the owner role.
3. Deploy the application code (it must work with both the old and the new schema during rollout).
4. **Rollback:** prefer rolling the code back (migrations are backward compatible). Reverting a migration in production (`db.js migrate:undo --confirm-production`) is a manual, approved step taken after a backup.

## 7. PR checklist for schema changes

- [ ] Migration with transactional `up` and working `down`
- [ ] Constraints: NOT NULL, FK + `ON DELETE`, CHECK, UNIQUE, indexes
- [ ] Model updated (explicit `DataType`, validation mirrors CHECKs)
- [ ] Shared enums/limits updated
- [ ] `schema.md` (+ ERD) and `relationships.md` updated
- [ ] Integration tests cover the new constraints
- [ ] `db:reset` and `npm run test` pass locally
- [ ] No personal data, no identity-document fields
