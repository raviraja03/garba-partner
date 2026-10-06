# SSL / TLS

> Related: [Production setup](production-setup.md), [Nginx](nginx.md)

## 1. Purpose

All three domains are served over HTTPS only, with certificates from Let's Encrypt that renew automatically. This page covers the first certificate, renewal, changing domains and what to check.

These steps have **not been run yet** (they need the real domains and the server). The order below avoids the usual first-time problem: Nginx cannot start an HTTPS site before the certificate exists, and certbot cannot prove ownership before Nginx answers on port 80.

Requirements: DNS records for the three domains point at the server; ports 80 and 443 are open; `certbot` is installed ([production setup §3](production-setup.md#3-prepare-the-server)).

## 2. First certificate

One certificate covers the three names. Its name is the web domain, which is what the Nginx templates expect.

```bash
# 1. Bootstrap site: port 80 only, answers the ownership challenge
sudo bash /srv/garba-partner/repo/deploy/scripts/render-nginx.sh --http-only

# 2. Read the domains from the env file (no secrets are read)
ENV=/etc/garba-partner/production.env
WEB=$(sudo grep -E '^WEB_DOMAIN=' "$ENV" | cut -d= -f2)
ADMIN=$(sudo grep -E '^ADMIN_DOMAIN=' "$ENV" | cut -d= -f2)
API=$(sudo grep -E '^API_DOMAIN=' "$ENV" | cut -d= -f2)
EMAIL=$(sudo grep -E '^LETSENCRYPT_EMAIL=' "$ENV" | cut -d= -f2)

# 3. Rehearse against the staging service first (no rate limits), then issue
sudo certbot certonly --webroot -w /var/www/letsencrypt --cert-name "$WEB" \
  -d "$WEB" -d "$ADMIN" -d "$API" --email "$EMAIL" --agree-tos --no-eff-email --dry-run
sudo certbot certonly --webroot -w /var/www/letsencrypt --cert-name "$WEB" \
  -d "$WEB" -d "$ADMIN" -d "$API" --email "$EMAIL" --agree-tos --no-eff-email

# 4. Full HTTPS site
sudo bash /srv/garba-partner/repo/deploy/scripts/render-nginx.sh
```

Files: `/etc/letsencrypt/live/<WEB_DOMAIN>/fullchain.pem` and `privkey.pem` (readable by root only; Nginx reads them as root at start).

## 3. Automatic renewal

Certificates last 90 days. The `certbot` package installs a systemd timer that renews them about 30 days before expiry, using the same webroot (port 80 stays open for this). Nginx must reload to use a renewed certificate:

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null <<'EOF'
#!/bin/sh
systemctl reload nginx
EOF
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

systemctl list-timers | grep certbot     # the timer exists
sudo certbot renew --dry-run             # the whole renewal works
```

`healthcheck.sh` fails when a certificate has fewer than 15 days left, which means renewal has not been working for two weeks. Let's Encrypt no longer sends expiry emails, so this check and your uptime monitor are the warning.

## 4. Changing or adding domains

```bash
# after DNS points at the server and the env file has the new names (production setup §9)
sudo certbot certonly --webroot -w /var/www/letsencrypt --cert-name "$WEB" \
  -d "$WEB" -d "$ADMIN" -d "$API" --email "$EMAIL" --agree-tos --no-eff-email
sudo bash /srv/garba-partner/current/deploy/scripts/render-nginx.sh
```

With the same `--cert-name`, certbot replaces the certificate. If the **web** domain itself changes, the certificate name changes too: issue it under the new name (or keep the old name and set `GP_CERT_NAME` when rendering), then remove the old one with `sudo certbot delete --cert-name <old>`.

To also serve `www.<WEB_DOMAIN>`, add it to the certificate (`-d www.<WEB_DOMAIN>`) and add a small `server` block to the template that redirects it to the bare domain.

## 5. Settings and decisions

| Topic | Choice |
|---|---|
| Protocols | TLS 1.2 and 1.3 only ([`gp-tls.conf`](../../deploy/nginx/snippets/gp-tls.conf)) |
| HSTS | `max-age=31536000` on the three domains. No `includeSubDomains`, no `preload` (see [nginx.md §5](nginx.md#5-security-settings)). HSTS cannot be undone quickly: once a browser has seen it, that domain must stay on HTTPS for a year |
| Certificate type | One certificate with three names. A wildcard is not needed and would require DNS-based validation |
| OCSP stapling | Off: Let's Encrypt has retired its OCSP service |
| CAA record (recommended) | In DNS: `CAA 0 issue "letsencrypt.org"`, so no other authority can issue for the domain |
| Cookies | The API sets `Secure` cookies outside development; they are never sent over plain HTTP |
| Database connection | PostgreSQL is on loopback, so `DATABASE_SSL=false`. For a remote or managed database set `DATABASE_SSL=true` |

## 6. Verification

```bash
sudo -iu garba bash /srv/garba-partner/current/deploy/scripts/healthcheck.sh   # redirects, HSTS, expiry
curl -sI http://<WEB_DOMAIN>/ | head -3                                        # 301 to https
echo | openssl s_client -connect <API_DOMAIN>:443 -servername <API_DOMAIN> 2>/dev/null | openssl x509 -noout -subject -dates -ext subjectAltName
```

An external scan (for example SSL Labs) should report grade A with no TLS 1.0/1.1.

## 7. Troubleshooting

| Symptom | Cause |
|---|---|
| certbot: "DNS problem: NXDOMAIN" | A domain does not resolve yet. Check with `dig +short <domain>` |
| certbot: "unauthorized … 404" on the challenge | The bootstrap site is not active, or the port 80 traffic goes elsewhere (firewall, another server, a CDN) |
| "too many certificates already issued" | Let's Encrypt rate limit after repeated real attempts. Use `--dry-run` while experimenting |
| Browser warning after a domain change | Nginx was not rendered again, or the certificate lacks the new name (`openssl` command above) |
| Renewal succeeded but browsers show the old expiry | The reload hook is missing (§3) |
