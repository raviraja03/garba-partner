# Database Setup

> Related: [Schema](schema.md), [Migration guide](migration-guide.md), [Environment variables](../setup/environment-variables.md), [Local development](../setup/local-development.md)

Garba Partner uses **PostgreSQL 16+** through **Sequelize 6 + sequelize-typescript**, with **Umzug** TypeScript migrations.

## 1. Local development

### 1.1 Install PostgreSQL

Install PostgreSQL 16 or newer (Windows installer, Homebrew, apt, or Docker if you prefer, though it isn't required). Make sure it listens on `127.0.0.1:5432`.

### 1.2 Create a role and two databases

Connect as a superuser (`psql -U postgres`) and run, replacing the password with your own:

```sql
CREATE ROLE gp_dev WITH LOGIN PASSWORD 'choose-a-strong-local-password';
CREATE DATABASE garba_partner      OWNER gp_dev ENCODING 'UTF8';
CREATE DATABASE garba_partner_test OWNER gp_dev ENCODING 'UTF8';
```

- `gp_dev` is an ordinary role (no superuser). It owns both databases, so it can create tables in their `public` schema (PostgreSQL 15+ grants that to the database owner).
- `garba_partner_test` is **disposable**: integration tests migrate it down/up and truncate tables.

### 1.3 Configure `.env`

In the repository root `.env` (git-ignored):

```dotenv
DATABASE_URL=postgres://gp_dev:<password>@127.0.0.1:5432/garba_partner
TEST_DATABASE_URL=postgres://gp_dev:<password>@127.0.0.1:5432/garba_partner_test
DATABASE_SSL=false
DATABASE_POOL_MAX=10

# Needed to create users (seeders). Generate each value with:
#   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
PHONE_HASH_SECRET=<random>
PHONE_ENCRYPTION_KEY=<random 32-byte base64>
PHONE_ENCRYPTION_KEY_VERSION=1
```

URL-encode special characters in the password (e.g. `@` → `%40`). See [environment variables](../setup/environment-variables.md) for every option.

### 1.4 Migrate, seed, verify

```bash
npm run db:migrate          # create the schema
npm run db:seed             # fictional development users
npm run db:migrate:status   # everything should be "executed"
npm run dev:api
curl http://127.0.0.1:4000/api/v1/health
# {"success":true,"message":"OK","data":{"status":"ok","database":"ok","timestamp":"..."}}
```

`npm run db:reset` rebuilds the development database from scratch at any time.

## 2. Development seed data

`20260925110000-dev-users` inserts fictional users. Their phone numbers are fake and stored only as hash + ciphertext. No SMS is ever sent in development.

| Name | Status | Onboarded | Discoverable | Verification | Purpose |
|---|---|---|---|---|---|
| Priya | active | ✅ | ✅ | photo **approved** (evidence purged) | Verified member. Has 1 active + 1 revoked session |
| Rohan | active | ✅ | ✅ | photo **pending** | Review queue |
| Kavya | active | ✅ | ✅ | — | Unverified member |
| Arjun | active | ✅ | ❌ | — | Events-only browser |
| Sam | active | ✅ | ✅ | photo **rejected** (`does_not_match_photos`) | Rejection flow |
| (no profile) | active | ❌ | — | — | Onboarding incomplete |
| Vikram | suspended | ✅ | ✅ (but suspended) | — | Sanction enforcement |
| Neha | pending_deletion | ✅ | ❌ | — | Deletion grace period |

IDs are fixed (`a1f0c3de-000N-4000-8000-00000000000N`), so `db:seed:undo` removes exactly these rows.

## 3. How the API connects

- `apps/api/src/config/database.ts` creates the Sequelize instance from `DATABASE_URL`, `DATABASE_SSL` and `DATABASE_POOL_MAX`, and registers all models. SQL logging is **off** because statements can contain personal data.
- At startup the API calls `authenticate()`. If the database is unreachable, the API **still starts** and logs an error, and `/api/v1/health` returns `503 SERVICE_UNAVAILABLE` until the database is back.
- `GET /api/v1/health` runs `SELECT 1` with a 2-second timeout:

| State | Response |
|---|---|
| Database reachable | `200` `{ success: true, data: { status: 'ok', database: 'ok', timestamp } }` |
| Database down or slow | `503` `{ success: false, message: 'Database is unavailable.', error: { code: 'SERVICE_UNAVAILABLE', details: null } }` |

No connection details or driver errors are ever exposed.
- On `SIGINT`/`SIGTERM` the HTTP server closes first, then the connection pool.

## 4. Production roles (least privilege)

Production uses two roles: an **owner** for migrations and an **app** role for the running API.

```sql
CREATE ROLE gp_owner WITH LOGIN PASSWORD '<strong>';
CREATE ROLE gp_app   WITH LOGIN PASSWORD '<strong>';
CREATE DATABASE garba_partner OWNER gp_owner ENCODING 'UTF8';

\c garba_partner
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gp_app;
-- Tables created later by gp_owner (migrations) become usable by gp_app for DML only.
ALTER DEFAULT PRIVILEGES FOR ROLE gp_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE gp_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gp_app;
```

```dotenv
DATABASE_URL=postgres://gp_app:<password>@127.0.0.1:5432/garba_partner
DATABASE_MIGRATION_URL=postgres://gp_owner:<password>@127.0.0.1:5432/garba_partner
APP_ENV=production
PHONE_HASH_SECRET=<required in production>
PHONE_ENCRYPTION_KEY=<required in production>
```

When the admin audit log arrives, `gp_app` will get only `INSERT, SELECT` on it (append-only). Other production concerns (TLS for managed databases, backups, restore drills) are in [system architecture §7](../architecture/system-architecture.md#7-observability-and-operations).

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `db: password authentication failed for user "gp_dev"` | Wrong password in `DATABASE_URL`, or the password has special characters that aren't URL-encoded |
| `db: database "garba_partner" does not exist` | Run the `CREATE DATABASE` statements in §1.2 |
| `permission denied for schema public` | The role doesn't own the database. `ALTER DATABASE garba_partner OWNER TO gp_dev;` |
| `Invalid server environment configuration: - DATABASE_URL: ...` | `DATABASE_URL` is missing or isn't a `postgres://` URL |
| `db: PHONE_HASH_SECRET and PHONE_ENCRYPTION_KEY are required to seed users` | Generate both values (§1.3) |
| `db: N pending migration(s). Run db:migrate first.` | Run `npm run db:migrate` before `db:seed` |
| `/api/v1/health` returns 503 | PostgreSQL is down or unreachable, or the credentials are wrong. Check the API log line `Database connection failed` |
| Integration tests are "skipped" | `TEST_DATABASE_URL` isn't set |
| `TEST_DATABASE_URL: must point to a different database than DATABASE_URL` | Use the separate `garba_partner_test` database |
