#!/usr/bin/env bash
# Garba Partner — renders the Nginx templates with the domains from the env file, tests the
# configuration and reloads Nginx. Guide: docs/deployment/nginx.md
#
# Usage (as root):
#   bash deploy/scripts/render-nginx.sh --http-only   # first run, before a certificate exists
#   bash deploy/scripts/render-nginx.sh               # full HTTPS site
#
# Options:
#   --http-only     render the bootstrap site that only answers Let's Encrypt challenges
#   --out DIR       write below DIR instead of /etc/nginx (dry run: no test, no reload)
#   --no-reload     write and test, but do not reload Nginx
#
# Environment: GP_ENV_FILE, GP_ROOT (see lib.sh); GP_CERT_NAME (default: WEB_DOMAIN);
# GP_ACME_ROOT (default: /var/www/letsencrypt).

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

HTTP_ONLY=0
OUT_DIR=/etc/nginx
RELOAD=1
while [ $# -gt 0 ]; do
  case "$1" in
    --http-only) HTTP_ONLY=1 ;;
    --out)
      OUT_DIR="${2:?--out needs a directory}"
      shift
      ;;
    --no-reload) RELOAD=0 ;;
    -h | --help)
      sed -n '2,17p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

need envsubst
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../nginx" && pwd)"
DRY_RUN=0
[ "$OUT_DIR" = /etc/nginx ] || DRY_RUN=1

WEB_DOMAIN="$(require_domain WEB_DOMAIN)"
ADMIN_DOMAIN="$(require_domain ADMIN_DOMAIN)"
API_DOMAIN="$(require_domain API_DOMAIN)"
API_PORT="$(env_get API_PORT 4000)"
[[ "$API_PORT" =~ ^[0-9]{2,5}$ ]] || die "API_PORT is not a port number"
CERT_NAME="${GP_CERT_NAME:-$WEB_DOMAIN}"
ACME_ROOT="${GP_ACME_ROOT:-/var/www/letsencrypt}"
WEB_ROOT="$GP_CURRENT_LINK/apps/web/dist"
ADMIN_ROOT="$GP_CURRENT_LINK/apps/admin/dist"
export WEB_DOMAIN ADMIN_DOMAIN API_DOMAIN API_PORT CERT_NAME ACME_ROOT WEB_ROOT ADMIN_ROOT
# Only these placeholders are replaced; Nginx's own $variables are left untouched.
VARS='${WEB_DOMAIN} ${ADMIN_DOMAIN} ${API_DOMAIN} ${API_PORT} ${CERT_NAME} ${ACME_ROOT} ${WEB_ROOT} ${ADMIN_ROOT}'

if [ "$HTTP_ONLY" -eq 0 ] && [ "$DRY_RUN" -eq 0 ]; then
  [ -r "/etc/letsencrypt/live/$CERT_NAME/fullchain.pem" ] ||
    die "no certificate for $CERT_NAME yet: run with --http-only, then issue it (docs/deployment/ssl.md)"
fi

mkdir -p "$OUT_DIR/conf.d" "$OUT_DIR/snippets" "$OUT_DIR/garba-partner"
[ "$DRY_RUN" -eq 1 ] || mkdir -p "$ACME_ROOT"

SITE="$OUT_DIR/conf.d/garba-partner.conf"
BACKUP=""
if [ -f "$SITE" ]; then
  BACKUP="$SITE.previous"
  cp -p "$SITE" "$BACKUP"
fi

render() { envsubst "$VARS" <"$1" >"$2"; }

if [ "$HTTP_ONLY" -eq 1 ]; then
  render "$TEMPLATE_DIR/garba-partner-http.conf.template" "$SITE"
else
  cp "$TEMPLATE_DIR/snippets/gp-tls.conf" "$OUT_DIR/snippets/gp-tls.conf"
  cp "$TEMPLATE_DIR/snippets/gp-proxy.conf" "$OUT_DIR/snippets/gp-proxy.conf"
  render "$TEMPLATE_DIR/snippets/gp-web-headers.conf.template" "$OUT_DIR/snippets/gp-web-headers.conf"
  render "$TEMPLATE_DIR/snippets/gp-admin-headers.conf.template" "$OUT_DIR/snippets/gp-admin-headers.conf"
  render "$TEMPLATE_DIR/garba-partner.conf.template" "$SITE"
fi
log "rendered $SITE for $WEB_DOMAIN, $ADMIN_DOMAIN, $API_DOMAIN"

if [ "$DRY_RUN" -eq 1 ]; then
  log "dry run (--out): not tested, not reloaded"
  exit 0
fi

need nginx
if ! nginx -t; then
  if [ -n "$BACKUP" ]; then
    cp -p "$BACKUP" "$SITE"
    warn "nginx -t failed: restored the previous site file"
  else
    rm -f "$SITE"
    warn "nginx -t failed: removed the new site file"
  fi
  die "Nginx configuration test failed; nothing was reloaded"
fi

if [ "$RELOAD" -eq 1 ]; then
  systemctl reload nginx
  log "nginx reloaded"
fi
