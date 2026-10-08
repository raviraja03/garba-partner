#!/usr/bin/env bash
# Garba Partner — production preflight: checks the server and the env file BEFORE anything is
# built, migrated or restarted. Read-only. Guide: docs/deployment/production-setup.md
#
# Usage (as the deploy user):
#   bash deploy/scripts/preflight.sh                  # server + env file
#   bash deploy/scripts/preflight.sh --release DIR    # also validates the built API's env
#
# Exit code 0 only when every check passes. Values of secrets are never printed.

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

RELEASE_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --release)
      RELEASE_DIR="${2:?--release needs a directory}"
      shift
      ;;
    -h | --help)
      sed -n '2,9p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

FAILURES=0
pass() { printf '  PASS  %s\n' "$*"; }
fail() {
  printf '  FAIL  %s\n' "$*"
  FAILURES=$((FAILURES + 1))
}
note() { printf '  NOTE  %s\n' "$*"; }
check() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$description"; else fail "$description"; fi
}

echo "== Tools"
for cmd in node npm git pm2 curl psql pg_dump pg_restore envsubst openssl; do
  check "$cmd is installed" command -v "$cmd"
done
# Nginx lives in /usr/sbin, which is often not on a normal user's PATH.
if command -v nginx >/dev/null 2>&1 || [ -x /usr/sbin/nginx ]; then pass "nginx is installed"; else fail "nginx is installed"; fi
if command -v node >/dev/null 2>&1; then
  check "Node.js is 22.12 or newer" node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);'
fi
[ "$(id -u)" -ne 0 ] && pass "not running as root" || fail "run as the deploy user, not root"

echo "== Env file ($GP_ENV_FILE)"
if [ ! -r "$GP_ENV_FILE" ]; then
  fail "env file is readable by this user"
  echo
  echo "Preflight FAILED ($FAILURES problem(s))."
  exit 1
fi
pass "env file is readable by this user"
MODE="$(stat -c '%a' "$GP_ENV_FILE" 2>/dev/null || echo unknown)"
case "$MODE" in
  600 | 640 | 400 | 440) pass "env file mode is $MODE (not world-readable)" ;;
  *) fail "env file mode is $MODE; use 640 (root:<deploy group>) or 600" ;;
esac
if grep -qE '^NODE_ENV=' "$GP_ENV_FILE"; then
  fail "NODE_ENV must not be set in the env file (PM2 sets it)"
else
  pass "NODE_ENV is not set in the env file"
fi
if [ "$(env_get LOG_OTP)" = "true" ]; then
  warn "LOG_OTP=true: one-time login codes are written to the server log. Turn it off after debugging."
else
  pass "LOG_OTP is off"
fi
if grep -q 'REPLACE_ME' "$GP_ENV_FILE"; then
  fail "placeholder REPLACE_ME is still present"
else
  pass "no REPLACE_ME placeholders"
fi

WEB_DOMAIN="$(env_get WEB_DOMAIN)"
ADMIN_DOMAIN="$(env_get ADMIN_DOMAIN)"
API_DOMAIN="$(env_get API_DOMAIN)"
for name in WEB_DOMAIN ADMIN_DOMAIN API_DOMAIN; do
  value="$(env_get "$name")"
  if [ -n "$value" ] && is_domain "$value"; then pass "$name is a valid domain"; else fail "$name is a valid domain"; fi
done
[ "$(env_get APP_ENV)" = production ] && pass "APP_ENV=production" || fail "APP_ENV=production"
[ "$(env_get API_HOST 127.0.0.1)" = 127.0.0.1 ] && pass "API listens on loopback only" ||
  fail "API_HOST must be 127.0.0.1 (Nginx is the only public entry point)"
[ "$(env_get WEB_ORIGIN)" = "https://$WEB_DOMAIN" ] && pass "WEB_ORIGIN matches WEB_DOMAIN" ||
  fail "WEB_ORIGIN must be exactly https://<WEB_DOMAIN>"
[ "$(env_get ADMIN_ORIGIN)" = "https://$ADMIN_DOMAIN" ] && pass "ADMIN_ORIGIN matches ADMIN_DOMAIN" ||
  fail "ADMIN_ORIGIN must be exactly https://<ADMIN_DOMAIN>"
[ "$(env_get VITE_API_BASE_URL)" = "https://$API_DOMAIN/api/v1" ] && pass "VITE_API_BASE_URL matches API_DOMAIN" ||
  fail "VITE_API_BASE_URL must be exactly https://<API_DOMAIN>/api/v1"
[ "$(env_get MEDIA_STORAGE)" = cloudinary ] && pass "MEDIA_STORAGE=cloudinary" || fail "MEDIA_STORAGE=cloudinary"

for name in DATABASE_URL PHONE_HASH_SECRET PHONE_ENCRYPTION_KEY OTP_HMAC_SECRET JWT_ACCESS_SECRET \
  JWT_ADMIN_ACCESS_SECRET CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET SMS_PROVIDER; do
  [ -n "$(env_get "$name")" ] && pass "$name is set" || fail "$name is set"
done
if [ -n "$(env_get DATABASE_MIGRATION_URL)" ] &&
  [ "$(env_get DATABASE_MIGRATION_URL)" != "$(env_get DATABASE_URL)" ]; then
  pass "migrations use a separate owner role (DATABASE_MIGRATION_URL)"
else
  fail "DATABASE_MIGRATION_URL must be set and differ from DATABASE_URL (least privilege)"
fi
[ -n "$(env_get BACKUP_GPG_RECIPIENT)" ] && pass "backups are encrypted (BACKUP_GPG_RECIPIENT)" ||
  fail "BACKUP_GPG_RECIPIENT is empty: backups would be stored unencrypted"
[ -n "$(env_get BACKUP_RCLONE_REMOTE)" ] && pass "off-site backup copy is configured" ||
  note "BACKUP_RCLONE_REMOTE is empty: backups stay on this server only"
[ "$(env_get PAYMENT_PROVIDER disabled)" = razorpay ] && pass "payments: razorpay" ||
  note "payments are disabled (PAYMENT_PROVIDER)"

echo "== Server"
BACKUP_DIR="$(env_get BACKUP_DIR /var/backups/garba-partner)"
check "backup directory is writable ($BACKUP_DIR)" test -w "$BACKUP_DIR"
check "log directory is writable ($GP_LOG_DIR)" test -w "$GP_LOG_DIR"
check "deployment root is writable ($GP_ROOT)" test -w "$GP_ROOT"
FREE_MB="$(df -Pm "$GP_ROOT" 2>/dev/null | awk 'NR==2 {print $4}')"
if [ -n "${FREE_MB:-}" ] && [ "$FREE_MB" -ge 2048 ]; then
  pass "at least 2 GB free on $GP_ROOT (${FREE_MB} MB)"
else
  fail "at least 2 GB free on $GP_ROOT (${FREE_MB:-unknown} MB)"
fi

if [ -n "$RELEASE_DIR" ]; then
  echo "== Built release ($RELEASE_DIR)"
  CHECK_SCRIPT="$RELEASE_DIR/apps/api/dist/scripts/check-env.js"
  if [ ! -f "$CHECK_SCRIPT" ]; then
    fail "release is built (apps/api/dist/scripts/check-env.js exists)"
  else
    # The API's own startup validation: the single source of truth for the app settings.
    if OUTPUT="$(cd "$RELEASE_DIR" && NODE_ENV=production node "$CHECK_SCRIPT" 2>&1)"; then
      pass "API environment validation"
    else
      fail "API environment validation:"
      printf '%s\n' "$OUTPUT" | sed 's/^/          /'
    fi
  fi
  for app in web admin; do
    check "$app bundle is built" test -f "$RELEASE_DIR/apps/$app/dist/index.html"
  done
  # A secret must never end up in a browser bundle (only VITE_* variables are public).
  LEAKED=0
  for name in JWT_ACCESS_SECRET JWT_ADMIN_ACCESS_SECRET OTP_HMAC_SECRET PHONE_HASH_SECRET \
    PHONE_ENCRYPTION_KEY CLOUDINARY_API_SECRET RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET; do
    value="$(env_get "$name")"
    [ -n "$value" ] || continue
    if grep -rqF -- "$value" "$RELEASE_DIR/apps/web/dist" "$RELEASE_DIR/apps/admin/dist" 2>/dev/null; then
      fail "$name is NOT in the browser bundles"
      LEAKED=1
    fi
  done
  [ "$LEAKED" -eq 0 ] && pass "no secret values in the browser bundles"
fi

echo
if [ "$FAILURES" -gt 0 ]; then
  echo "Preflight FAILED ($FAILURES problem(s)). Nothing was changed."
  exit 1
fi
echo "Preflight passed."
