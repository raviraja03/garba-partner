-- Garba Partner — production database roles (least privilege).
-- Guide: docs/deployment/production-setup.md §5
--
-- Run ONCE as the PostgreSQL superuser. Safe to run again (it only adds what is missing):
--
--   sudo -u postgres psql -v db=garba_partner -v owner=gp_owner -v app=gp_app \
--        -f deploy/postgres/setup-roles.sql
--
-- Then set the two passwords interactively (never in a file or on a command line):
--
--   sudo -u postgres psql -c '\password gp_owner'
--   sudo -u postgres psql -c '\password gp_app'
--
--   owner  owns the schema: used only for migrations, backups and `admin:create`
--          (DATABASE_MIGRATION_URL).
--   app    used by the running API (DATABASE_URL): SELECT/INSERT/UPDATE/DELETE only. It
--          cannot create, alter, drop or truncate anything, so a compromised API cannot
--          change the schema or remove the append-only audit trigger.

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE %I LOGIN', :'owner')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'owner') \gexec

SELECT format('CREATE ROLE %I LOGIN', :'app')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app') \gexec

SELECT format('CREATE DATABASE %I OWNER %I ENCODING ''UTF8'' TEMPLATE template0', :'db', :'owner')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec

-- Neither role may create roles or databases, or bypass row security.
ALTER ROLE :"owner" NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE :"app" NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- Only these two roles may connect to the database.
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO :"owner";
GRANT CONNECT ON DATABASE :"db" TO :"app";

\connect :"db"

ALTER SCHEMA public OWNER TO :"owner";
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app";

-- Everything the owner creates from now on (every migration, every restore) is usable by
-- the app role with DML only.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app";

-- The same for objects that already exist (when this runs after the first migration).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app";

-- Guard rails for the running API: no runaway queries, no forgotten transactions.
ALTER ROLE :"app" SET statement_timeout = '30s';
ALTER ROLE :"app" SET lock_timeout = '10s';
ALTER ROLE :"app" SET idle_in_transaction_session_timeout = '60s';

\echo 'Roles and database are ready. Now set both passwords with \\password.'
