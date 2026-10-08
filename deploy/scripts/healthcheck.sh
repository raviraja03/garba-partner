#!/usr/bin/env bash
# Garba Partner — production health checks. Read-only. Guide: docs/deployment/production-setup.md
#
# Usage:
#   bash deploy/scripts/healthcheck.sh            # local checks + public HTTPS checks
#   bash deploy/scripts/healthcheck.sh --local    # only this server (API process, database)
#
# Exit code 0 only when every check passes. A deployment is complete only when the full run
# (without --local) passes on the server.

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

LOCAL_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --local) LOCAL_ONLY=1 ;;
    -h | --help)
      sed -n '2,9p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

need curl
FAILURES=0
pass() { printf '  PASS  %s\n' "$*"; }
fail() {
  printf '  FAIL  %s\n' "$*"
  FAILURES=$((FAILURES + 1))
}
note() { printf '  NOTE  %s\n' "$*"; }

# http_status URL [curl options...] — the status code, or 000 when the request failed.
http_status() {
  local url="$1" code
  shift
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" "$url")" || code=000
  printf '%s' "$code"
}
# header_value URL HEADER [curl options...] — one response header (lowercased name match).
header_value() {
  local url="$1" header="$2"
  shift 2
  curl -s -o /dev/null -D - --max-time 10 "$@" "$url" 2>/dev/null |
    awk -v h="$(printf '%s' "$header" | tr '[:upper:]' '[:lower:]')" -F': ' \
      'tolower($1) == h { sub(/\r$/, "", $2); print $2; exit }'
}
expect_status() {
  local description="$1" expected="$2" url="$3" actual
  shift 3
  actual="$(http_status "$url" "$@")"
  if [ "$actual" = "$expected" ]; then pass "$description ($actual)"; else fail "$description (expected $expected, got $actual)"; fi
}

API_PORT="$(env_get API_PORT 4000)"
LOCAL_API="http://127.0.0.1:${API_PORT}/api/v1"

echo "== API process (this server)"
STATUS="$(api_status)"
[ "$STATUS" = online ] && pass "PM2 process gp-api is online" || fail "PM2 process gp-api is $STATUS"
HEALTH_BODY="$(curl -s --max-time 10 "$LOCAL_API/health" || true)"
case "$HEALTH_BODY" in
  *'"status":"ok"'*'"database":"ok"'*) pass "API health: API and database are up" ;;
  *) fail "API health on $LOCAL_API/health (API down or database unreachable)" ;;
esac
expect_status "unknown API route returns 404" 404 "$LOCAL_API/definitely-not-a-route"
expect_status "protected route refuses anonymous access" 401 "$LOCAL_API/auth/me"
if [ -L "$GP_CURRENT_LINK" ]; then
  pass "current release: $(current_release)"
else
  fail "$GP_CURRENT_LINK points to a release"
fi

if [ "$LOCAL_ONLY" -eq 0 ]; then
  WEB_DOMAIN="$(require_domain WEB_DOMAIN)"
  ADMIN_DOMAIN="$(require_domain ADMIN_DOMAIN)"
  API_DOMAIN="$(require_domain API_DOMAIN)"

  echo "== HTTPS"
  for domain in "$WEB_DOMAIN" "$ADMIN_DOMAIN" "$API_DOMAIN"; do
    expect_status "http://$domain redirects to HTTPS" 301 "http://$domain/"
    HSTS="$(header_value "https://$domain/" strict-transport-security)"
    [ -n "$HSTS" ] && pass "https://$domain sends HSTS" || fail "https://$domain sends HSTS"
    if command -v openssl >/dev/null 2>&1; then
      END_DATE="$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null |
        openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
      if [ -n "$END_DATE" ]; then
        DAYS=$((($(date -d "$END_DATE" +%s) - $(date +%s)) / 86400))
        [ "$DAYS" -ge 15 ] && pass "certificate for $domain valid for $DAYS more days" ||
          fail "certificate for $domain expires in $DAYS days (renewal is not working)"
      else
        fail "certificate for $domain can be read"
      fi
    fi
  done

  echo "== Web app (https://$WEB_DOMAIN)"
  expect_status "web app loads" 200 "https://$WEB_DOMAIN/"
  expect_status "deep link renders the app" 200 "https://$WEB_DOMAIN/events"
  CSP="$(header_value "https://$WEB_DOMAIN/" content-security-policy)"
  case "$CSP" in
    *"https://$API_DOMAIN"*"wss://$API_DOMAIN"*) pass "web CSP allows the API and its WebSocket" ;;
    *) fail "web CSP allows the API and its WebSocket" ;;
  esac
  # The web domain serves only static files: an API path there must return the app page.
  case "$(header_value "https://$WEB_DOMAIN/api/v1/health" content-type)" in
    text/html*) pass "the web domain does not proxy the API" ;;
    *) fail "the web domain does not proxy the API" ;;
  esac

  echo "== Admin panel (https://$ADMIN_DOMAIN)"
  ADMIN_STATUS="$(http_status "https://$ADMIN_DOMAIN/")"
  case "$ADMIN_STATUS" in
    200) pass "admin panel loads (200)" ;;
    403) pass "admin panel is behind the IP allow-list (403 from this server)" ;;
    *) fail "admin panel loads (got $ADMIN_STATUS)" ;;
  esac

  echo "== API (https://$API_DOMAIN)"
  expect_status "public API health" 200 "https://$API_DOMAIN/api/v1/health"
  expect_status "API root is not exposed" 404 "https://$API_DOMAIN/"
  expect_status "Socket.IO endpoint answers" 200 "https://$API_DOMAIN/socket.io/?EIO=4&transport=polling"
  ALLOWED="$(header_value "https://$API_DOMAIN/api/v1/auth/refresh" access-control-allow-origin \
    -X OPTIONS -H "Origin: https://$WEB_DOMAIN" -H 'Access-Control-Request-Method: POST')"
  [ "$ALLOWED" = "https://$WEB_DOMAIN" ] && pass "CORS allows the web origin" || fail "CORS allows the web origin"
  ALLOWED="$(header_value "https://$API_DOMAIN/api/v1/admin/auth/login" access-control-allow-origin \
    -X OPTIONS -H "Origin: https://$ADMIN_DOMAIN" -H 'Access-Control-Request-Method: POST')"
  case "$ALLOWED" in
    "https://$ADMIN_DOMAIN") pass "CORS allows the admin origin" ;;
    *)
      [ "$(http_status "https://$API_DOMAIN/api/v1/admin/auth/me")" = 403 ] &&
        pass "admin API is behind the IP allow-list (403 from this server)" ||
        fail "CORS allows the admin origin"
      ;;
  esac
  FOREIGN="$(header_value "https://$API_DOMAIN/api/v1/auth/refresh" access-control-allow-origin \
    -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST')"
  [ -z "$FOREIGN" ] && pass "CORS refuses a foreign origin" || fail "CORS refuses a foreign origin"
fi

echo
if [ "$FAILURES" -gt 0 ]; then
  echo "Health check FAILED ($FAILURES problem(s))."
  exit 1
fi
echo "Health check passed."
