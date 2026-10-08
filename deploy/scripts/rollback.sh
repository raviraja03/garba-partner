#!/usr/bin/env bash
# Garba Partner — code rollback: points `current` at an earlier release and restarts the API.
# Guide: docs/deployment/rollback.md (read it first: the database is NOT changed here).
#
# Usage (as the deploy user):
#   bash deploy/scripts/rollback.sh --list           # show the releases on this server
#   bash deploy/scripts/rollback.sh                  # go back to the release before the live one
#   bash deploy/scripts/rollback.sh RELEASE_ID       # go to a specific release

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TARGET=""
LIST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --list) LIST=1 ;;
    -h | --help)
      sed -n '2,8p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    -*) die "unknown option: $1" ;;
    *) TARGET="$1" ;;
  esac
  shift
done

[ -d "$GP_RELEASES_DIR" ] || die "no releases directory: $GP_RELEASES_DIR"
LIVE="$(current_release)"
mapfile -t RELEASES < <(ls -1 "$GP_RELEASES_DIR" | sort)

if [ "$LIST" -eq 1 ]; then
  for release in "${RELEASES[@]}"; do
    if [ "$release" = "$LIVE" ]; then printf '* %s (live)\n' "$release"; else printf '  %s\n' "$release"; fi
  done
  exit 0
fi

[ "$(id -u)" -ne 0 ] || die "run as the deploy user, not root"
[ -n "$LIVE" ] || die "nothing is deployed yet"

if [ -z "$TARGET" ]; then
  for release in "${RELEASES[@]}"; do
    [ "$release" = "$LIVE" ] && break
    TARGET="$release"
  done
  [ -n "$TARGET" ] || die "there is no release older than the live one ($LIVE)"
fi
[[ "$TARGET" =~ ^[0-9]{14}-[0-9a-f]+$ ]] || die "not a release id: $TARGET"
[ -d "$GP_RELEASES_DIR/$TARGET" ] || die "release not found: $TARGET (see --list)"
[ "$TARGET" != "$LIVE" ] || die "$TARGET is already live"

warn "rolling back the CODE from $LIVE to $TARGET; the database schema and data stay as they are"
switch_current "$GP_RELEASES_DIR/$TARGET"
restart_api

if wait_for_api 60 && bash "$GP_RELEASES_DIR/$TARGET/deploy/scripts/healthcheck.sh" --local; then
  log "rolled back to $TARGET. Run the full check: bash $GP_CURRENT_LINK/deploy/scripts/healthcheck.sh"
else
  die "release $TARGET is not healthy after the rollback (pm2 logs gp-api)"
fi
