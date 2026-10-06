#!/usr/bin/env bash
# Garba Partner — production deploy. Guide: docs/deployment/production-setup.md
#
# Usage (as the deploy user, never root):
#   bash /srv/garba-partner/repo/deploy/scripts/deploy.sh [GIT_REF] [--skip-backup]
#
#   GIT_REF        tag, branch or commit to deploy (default: origin/main). Prefer a tag.
#   --skip-backup  do not back up the database first (only for a server with no real data)
#
# Steps: fetch → new release directory → install → build → preflight → database backup →
# migrations → switch `current` → restart the API → health check → prune old releases.
# If the API is not healthy after the switch, the previous release is restored
# automatically (code only: migrations are not reverted, see docs/deployment/rollback.md).

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

GIT_REF="origin/main"
SKIP_BACKUP=0
KEEP_RELEASES="${GP_KEEP_RELEASES:-5}"
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-backup) SKIP_BACKUP=1 ;;
    -h | --help)
      sed -n '2,14p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    -*) die "unknown option: $1" ;;
    *) GIT_REF="$1" ;;
  esac
  shift
done

[ "$(id -u)" -ne 0 ] || die "run as the deploy user, not root"
need git node npm pm2 curl tar flock
[ -d "$GP_REPO_DIR/.git" ] || die "no git clone at $GP_REPO_DIR (see production-setup.md)"
[ -r "$GP_ENV_FILE" ] || die "cannot read env file: $GP_ENV_FILE"
mkdir -p "$GP_RELEASES_DIR"

# One deploy at a time.
exec 9>"$GP_ROOT/.deploy.lock"
flock -n 9 || die "another deploy is running"

log "fetching $GIT_REF"
git -C "$GP_REPO_DIR" fetch --tags --prune origin
SHA="$(git -C "$GP_REPO_DIR" rev-parse --verify --short=12 "${GIT_REF}^{commit}")" ||
  die "unknown git ref: $GIT_REF"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-$SHA"
RELEASE_DIR="$GP_RELEASES_DIR/$RELEASE_ID"
PREVIOUS_RELEASE="$(current_release)"
log "release $RELEASE_ID (previous: ${PREVIOUS_RELEASE:-none})"

# Until the switch, a failure only leaves an unused directory behind: remove it.
SWITCHED=0
cleanup() {
  if [ "$SWITCHED" -eq 0 ] && [ -d "$RELEASE_DIR" ]; then
    warn "deploy failed before the switch; removing $RELEASE_DIR (the running release is untouched)"
    rm -rf "$RELEASE_DIR"
  fi
}
trap cleanup EXIT

mkdir "$RELEASE_DIR"
git -C "$GP_REPO_DIR" archive "$SHA" | tar -x -C "$RELEASE_DIR"
# The API and the Vite builds read `<release>/.env`; the real file lives outside the tree.
ln -s "$GP_ENV_FILE" "$RELEASE_DIR/.env"
printf 'release=%s\nref=%s\ncommit=%s\nbuilt_at=%s\n' \
  "$RELEASE_ID" "$GIT_REF" "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$RELEASE_DIR/RELEASE"

log "installing dependencies"
# NODE_ENV must be unset here: with "production", npm would skip the build tools.
(cd "$RELEASE_DIR" && env -u NODE_ENV npm ci --no-audit --no-fund)
log "building"
(cd "$RELEASE_DIR" && env -u NODE_ENV npm run build)

log "preflight"
bash "$RELEASE_DIR/deploy/scripts/preflight.sh" --release "$RELEASE_DIR"

if [ "$SKIP_BACKUP" -eq 1 ]; then
  warn "skipping the database backup (--skip-backup)"
else
  log "backing up the database"
  bash "$RELEASE_DIR/deploy/scripts/backup-db.sh" --label "pre-$RELEASE_ID"
fi

log "running migrations"
(cd "$RELEASE_DIR" && NODE_ENV=production npm run --silent db:migrate:prod -w @garba-partner/api)

log "switching to $RELEASE_ID"
switch_current "$RELEASE_DIR"
SWITCHED=1
restart_api

if wait_for_api 60 && bash "$RELEASE_DIR/deploy/scripts/healthcheck.sh" --local; then
  log "release $RELEASE_ID is live"
else
  warn "the new release is NOT healthy"
  if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$GP_RELEASES_DIR/$PREVIOUS_RELEASE" ]; then
    warn "restoring the previous release $PREVIOUS_RELEASE"
    switch_current "$GP_RELEASES_DIR/$PREVIOUS_RELEASE"
    restart_api
    wait_for_api 60 || warn "the previous release is not healthy either: investigate now"
    die "deploy failed and was rolled back to $PREVIOUS_RELEASE (migrations were NOT reverted; see rollback.md)"
  fi
  die "deploy failed and there is no previous release to restore (pm2 logs gp-api)"
fi

# Keep the newest releases (the live one is always among them).
mapfile -t OLD_RELEASES < <(ls -1 "$GP_RELEASES_DIR" | sort -r | tail -n "+$((KEEP_RELEASES + 1))")
for old in "${OLD_RELEASES[@]}"; do
  [ "$old" != "$RELEASE_ID" ] && [ "$old" != "$PREVIOUS_RELEASE" ] || continue
  rm -rf "${GP_RELEASES_DIR:?}/$old"
  log "removed old release $old"
done

log "done. Now run the full check: bash $GP_CURRENT_LINK/deploy/scripts/healthcheck.sh"
