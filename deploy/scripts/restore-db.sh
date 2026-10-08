#!/usr/bin/env bash
# Garba Partner — restores a backup made by backup-db.sh. Guide: docs/deployment/database-backup.md
#
# Usage:
#   bash deploy/scripts/restore-db.sh BACKUP_FILE --dbname NAME [--overwrite-production]
#
# The target database must already exist and be owned by the owner role, e.g.
#   sudo -u postgres createdb -O gp_owner garba_partner_restore
# Restoring into the PRODUCTION database (the one in the env file) is refused unless
# --overwrite-production is given and the database name is typed to confirm: stop the API
# first (`pm2 stop gp-api`). Encrypted backups (.gpg) need the private key on this machine.

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_FILE=""
TARGET_DB=""
OVERWRITE_PRODUCTION=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dbname)
      TARGET_DB="${2:?--dbname needs a database name}"
      shift
      ;;
    --overwrite-production) OVERWRITE_PRODUCTION=1 ;;
    -h | --help)
      sed -n '2,11p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    -*) die "unknown option: $1" ;;
    *) BACKUP_FILE="$1" ;;
  esac
  shift
done
[ -n "$BACKUP_FILE" ] && [ -r "$BACKUP_FILE" ] || die "backup file not found or not readable"
[[ "$TARGET_DB" =~ ^[a-z_][a-z0-9_]*$ ]] || die "--dbname is required (lowercase letters, digits, underscore)"

need pg_restore psql node sha256sum
umask 077

DB_URL="$(env_get DATABASE_MIGRATION_URL)"
[ -n "$DB_URL" ] || DB_URL="$(env_require DATABASE_URL)"
url_part() { GP_DB_URL="$DB_URL" node -e '
  const url = new URL(process.env.GP_DB_URL);
  const part = { host: url.hostname, port: url.port || "5432", user: url.username,
    password: url.password, database: url.pathname.slice(1) }[process.argv[1]];
  process.stdout.write(decodeURIComponent(part));' "$1"; }
PRODUCTION_DB="$(url_part database)"
PGHOST="$(url_part host)"
PGPORT="$(url_part port)"
PGUSER="$(url_part user)"
PGPASSWORD="$(url_part password)"
PGDATABASE="$TARGET_DB"
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
[ "$(env_get DATABASE_SSL false)" = true ] && export PGSSLMODE=require

if [ "$TARGET_DB" = "$PRODUCTION_DB" ]; then
  [ "$OVERWRITE_PRODUCTION" -eq 1 ] ||
    die "$TARGET_DB is the production database: restore into another database first, or pass --overwrite-production"
  [ "$(api_status)" != online ] || die "the API is running: stop it first (pm2 stop gp-api)"
  printf 'This REPLACES all data in the production database "%s".\nType the database name to continue: ' "$TARGET_DB"
  read -r ANSWER
  [ "$ANSWER" = "$TARGET_DB" ] || die "confirmation did not match; nothing was changed"
fi

if [ -f "$BACKUP_FILE.sha256" ]; then
  (cd "$(dirname "$BACKUP_FILE")" && sha256sum --check --quiet "$(basename "$BACKUP_FILE").sha256") ||
    die "checksum mismatch: the backup file is damaged"
  log "checksum verified"
else
  warn "no .sha256 file next to the backup: integrity not verified"
fi

DUMP_FILE="$BACKUP_FILE"
TMP_FILE=""
if [[ "$BACKUP_FILE" == *.gpg ]]; then
  need gpg
  TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/gp-restore.XXXXXX")"
  trap 'rm -f "$TMP_FILE"' EXIT
  gpg --batch --yes --decrypt --output "$TMP_FILE" "$BACKUP_FILE"
  DUMP_FILE="$TMP_FILE"
fi

log "restoring into database $TARGET_DB"
# Objects are created by the owner role, so its default privileges give the runtime role
# its DML rights again (deploy/postgres/setup-roles.sql).
pg_restore --no-owner --no-privileges --clean --if-exists --exit-on-error \
  --single-transaction --dbname="$TARGET_DB" "$DUMP_FILE"

log "restore finished; verification:"
psql --no-psqlrc --quiet --tuples-only --set ON_ERROR_STOP=1 <<'SQL'
SELECT 'latest migration: ' || max(name) FROM schema_migrations;
SELECT 'migrations applied: ' || count(*) FROM schema_migrations;
SELECT 'members: ' || count(*) FROM users;
SELECT 'admins: ' || count(*) FROM admin_users;
SELECT 'events: ' || count(*) FROM events;
SQL
