#!/usr/bin/env bash
# Garba Partner — helpers shared by the deploy scripts. Source it, do not run it:
#   . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
#
# Paths can be overridden through the environment (defaults suit docs/deployment/):
#   GP_ENV_FILE   protected env file            /etc/garba-partner/production.env
#   GP_ROOT       deployment root               /srv/garba-partner
#   GP_LOG_DIR    PM2 log directory             /var/log/garba-partner

set -Eeuo pipefail

GP_ENV_FILE="${GP_ENV_FILE:-/etc/garba-partner/production.env}"
GP_ROOT="${GP_ROOT:-/srv/garba-partner}"
GP_LOG_DIR="${GP_LOG_DIR:-/var/log/garba-partner}"
GP_RELEASES_DIR="$GP_ROOT/releases"
GP_CURRENT_LINK="$GP_ROOT/current"
GP_REPO_DIR="$GP_ROOT/repo"
export GP_LOG_DIR

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
warn() { printf '[%s] WARNING: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() {
  printf '[%s] ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
  exit 1
}

need() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "required command not found: $cmd"
  done
}

# env_get KEY [default] — prints one value from the env file (never sources the file, so
# passwords and URLs with shell characters are safe). Empty or missing → the default.
env_get() {
  local key="$1" default="${2-}" line value
  [ -r "$GP_ENV_FILE" ] || die "cannot read env file: $GP_ENV_FILE"
  line="$(grep -E "^${key}=" "$GP_ENV_FILE" | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%$'\r'}"
  case "$value" in
    \"*\") value="${value#\"}" && value="${value%\"}" ;;
    \'*\') value="${value#\'}" && value="${value%\'}" ;;
  esac
  if [ -z "$line" ] || [ -z "$value" ]; then
    printf '%s' "$default"
  else
    printf '%s' "$value"
  fi
}

# env_require KEY — like env_get, but stops when the value is missing. Never prints values.
env_require() {
  local value
  value="$(env_get "$1")"
  [ -n "$value" ] || die "$1 is not set in $GP_ENV_FILE"
  printf '%s' "$value"
}

# A hostname such as "api.example.in": nothing that could inject Nginx or shell syntax.
is_domain() {
  [[ "$1" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]
}

require_domain() {
  local value
  value="$(env_require "$1")"
  is_domain "$value" || die "$1 is not a valid lowercase domain name"
  printf '%s' "$value"
}

# The release the `current` symlink points to (empty when nothing is deployed yet).
current_release() {
  if [ -L "$GP_CURRENT_LINK" ]; then
    basename "$(readlink -f "$GP_CURRENT_LINK")"
  fi
}

# Atomically points `current` at a release directory.
switch_current() {
  local target="$1"
  [ -d "$target" ] || die "release not found: $target"
  ln -sfn "$target" "$GP_CURRENT_LINK.new"
  mv -Tf "$GP_CURRENT_LINK.new" "$GP_CURRENT_LINK"
}

# (Re)starts the API from the current release and saves the PM2 process list.
restart_api() {
  need pm2
  pm2 startOrRestart "$GP_CURRENT_LINK/ecosystem.config.cjs" --update-env
  pm2 save >/dev/null
}

# wait_for_api [seconds] — polls the local health endpoint until it answers 200.
wait_for_api() {
  local timeout="${1:-60}" port elapsed=0
  port="$(env_get API_PORT 4000)"
  need curl
  while [ "$elapsed" -lt "$timeout" ]; do
    if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:${port}/api/v1/health"; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

# The PM2 status of the API process: online, stopped, errored, missing or unknown.
api_status() {
  command -v pm2 >/dev/null 2>&1 || {
    printf 'unknown'
    return 0
  }
  pm2 jlist 2>/dev/null | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      try {
        const app = JSON.parse(input).find((p) => p.name === "gp-api");
        process.stdout.write(app ? app.pm2_env.status : "missing");
      } catch {
        process.stdout.write("unknown");
      }
    });' 2>/dev/null || printf 'unknown'
}
