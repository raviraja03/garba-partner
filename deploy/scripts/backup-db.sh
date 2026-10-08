#!/usr/bin/env bash
# Garba Partner — PostgreSQL backup: dump, verify, encrypt, copy off-site, prune.
# Guide: docs/deployment/database-backup.md
#
# Usage (as the deploy user; also run nightly from cron):
#   bash deploy/scripts/backup-db.sh [--label NAME] [--allow-unencrypted]
#
# Settings come from the env file: DATABASE_MIGRATION_URL (or DATABASE_URL), BACKUP_DIR,
# BACKUP_RETENTION_DAYS, BACKUP_GPG_RECIPIENT, BACKUP_RCLONE_REMOTE.
# Prints the path of the finished backup on the last line.

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

LABEL=""
ALLOW_UNENCRYPTED=0
while [ $# -gt 0 ]; do
  case "$1" in
    --label)
      LABEL="${2:?--label needs a name}"
      shift
      ;;
    --allow-unencrypted) ALLOW_UNENCRYPTED=1 ;;
    -h | --help)
      sed -n '2,10p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done
[[ "$LABEL" =~ ^[A-Za-z0-9._-]*$ ]] || die "--label may only contain letters, digits, dot, dash, underscore"

need pg_dump pg_restore node sha256sum
umask 077

DB_URL="$(env_get DATABASE_MIGRATION_URL)"
[ -n "$DB_URL" ] || DB_URL="$(env_require DATABASE_URL)"
BACKUP_DIR="$(env_get BACKUP_DIR /var/backups/garba-partner)"
RETENTION_DAYS="$(env_get BACKUP_RETENTION_DAYS 14)"
GPG_RECIPIENT="$(env_get BACKUP_GPG_RECIPIENT)"
RCLONE_REMOTE="$(env_get BACKUP_RCLONE_REMOTE)"
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || die "BACKUP_RETENTION_DAYS must be a number"
[ -d "$BACKUP_DIR" ] && [ -w "$BACKUP_DIR" ] || die "backup directory is not writable: $BACKUP_DIR"

if [ -z "$GPG_RECIPIENT" ] && [ "$ALLOW_UNENCRYPTED" -eq 0 ]; then
  die "BACKUP_GPG_RECIPIENT is empty: refusing to write an unencrypted backup (use --allow-unencrypted on a test server)"
fi

# The connection goes to pg_dump through PG* variables, never on the command line (where
# the password would be visible in the process list).
url_part() { GP_DB_URL="$DB_URL" node -e '
  const url = new URL(process.env.GP_DB_URL);
  const part = { host: url.hostname, port: url.port || "5432", user: url.username,
    password: url.password, database: url.pathname.slice(1) }[process.argv[1]];
  process.stdout.write(decodeURIComponent(part));' "$1"; }
PGHOST="$(url_part host)"
PGPORT="$(url_part port)"
PGUSER="$(url_part user)"
PGPASSWORD="$(url_part password)"
PGDATABASE="$(url_part database)"
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
[ "$(env_get DATABASE_SSL false)" = true ] && export PGSSLMODE=require

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="${PGDATABASE}-${STAMP}${LABEL:+-$LABEL}.dump"
TMP_FILE="$BACKUP_DIR/.${NAME}.partial"
trap 'rm -f "$TMP_FILE"' EXIT

log "dumping database $PGDATABASE"
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$TMP_FILE"
# A dump that cannot be listed cannot be restored.
pg_restore --list "$TMP_FILE" >/dev/null || die "the dump failed verification"

if [ -n "$GPG_RECIPIENT" ]; then
  need gpg
  FINAL="$BACKUP_DIR/$NAME.gpg"
  gpg --batch --yes --trust-model always --encrypt --recipient "$GPG_RECIPIENT" \
    --output "$FINAL" "$TMP_FILE"
  rm -f "$TMP_FILE"
else
  FINAL="$BACKUP_DIR/$NAME"
  mv "$TMP_FILE" "$FINAL"
  warn "backup is NOT encrypted"
fi
trap - EXIT
(cd "$BACKUP_DIR" && sha256sum "$(basename "$FINAL")" >"$(basename "$FINAL").sha256")
log "backup written: $FINAL ($(du -h "$FINAL" | cut -f1))"

OFFSITE_FAILED=0
if [ -n "$RCLONE_REMOTE" ]; then
  need rclone
  if rclone copy "$FINAL" "$RCLONE_REMOTE" && rclone copy "$FINAL.sha256" "$RCLONE_REMOTE"; then
    log "copied off-site to $RCLONE_REMOTE"
  else
    OFFSITE_FAILED=1
    warn "off-site copy FAILED; the local backup is kept"
  fi
else
  warn "no off-site copy (BACKUP_RCLONE_REMOTE is empty): this backup dies with the server"
fi

# Local retention. Off-site retention is configured on the storage (lifecycle rules).
find "$BACKUP_DIR" -maxdepth 1 -type f -name "${PGDATABASE}-*.dump*" -mtime "+$RETENTION_DAYS" -delete

[ "$OFFSITE_FAILED" -eq 0 ] || die "backup finished locally, but the off-site copy failed"
printf '%s\n' "$FINAL"
