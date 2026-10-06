# Nginx

> Related: [Production setup](production-setup.md), [SSL](ssl.md), [Security best practices](../security/security-best-practices.md), [Security architecture](../architecture/security-architecture.md)

## 1. Purpose

Nginx is the only process that listens on the internet. It terminates TLS, serves the two browser apps as static files, proxies the API domain to the Node process on loopback, sets the browser security headers and applies a coarse rate limit.

The configuration has **not been tested with `nginx -t` yet** (no Nginx on the development machine). `render-nginx.sh` runs that test on the server before every reload and keeps the previous file if it fails.

## 2. Files

| Repository file | Installed as | Content |
|---|---|---|
| [`deploy/nginx/garba-partner.conf.template`](../../deploy/nginx/garba-partner.conf.template) | `/etc/nginx/conf.d/garba-partner.conf` | Rate-limit zone, log format, upstream, port 80 redirect, and one `server` per domain |
| [`deploy/nginx/garba-partner-http.conf.template`](../../deploy/nginx/garba-partner-http.conf.template) | same path (bootstrap only) | Port 80 only: answers Let's Encrypt challenges before a certificate exists |
| [`snippets/gp-tls.conf`](../../deploy/nginx/snippets/gp-tls.conf) | `/etc/nginx/snippets/` | TLS 1.2/1.3, ciphers, session cache |
| [`snippets/gp-proxy.conf`](../../deploy/nginx/snippets/gp-proxy.conf) | `/etc/nginx/snippets/` | `proxy_pass` to the API with the forwarded headers |
| [`snippets/gp-web-headers.conf.template`](../../deploy/nginx/snippets/gp-web-headers.conf.template) | `/etc/nginx/snippets/gp-web-headers.conf` | Security headers and CSP of the web app |
| [`snippets/gp-admin-headers.conf.template`](../../deploy/nginx/snippets/gp-admin-headers.conf.template) | `/etc/nginx/snippets/gp-admin-headers.conf` | Stricter headers and CSP of the admin panel |

Never edit the installed files: change the template in the repository and render again.

## 3. Rendering

```bash
sudo bash /srv/garba-partner/current/deploy/scripts/render-nginx.sh            # full site
sudo bash /srv/garba-partner/repo/deploy/scripts/render-nginx.sh --http-only   # before the first certificate
bash deploy/scripts/render-nginx.sh --out /tmp/nginx-preview                    # dry run anywhere: writes files only
```

The script reads these values and replaces only the matching `${...}` placeholders (Nginx's own `$variables` are untouched):

| Placeholder | Source | Default |
|---|---|---|
| `WEB_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN` | env file | required; must be plain lowercase hostnames (anything else is rejected) |
| `API_PORT` | env file | `4000` |
| `CERT_NAME` | `GP_CERT_NAME` | `WEB_DOMAIN` (the certificate name used in [ssl.md](ssl.md)) |
| `ACME_ROOT` | `GP_ACME_ROOT` | `/var/www/letsencrypt` |
| `WEB_ROOT`, `ADMIN_ROOT` | `GP_ROOT` | `/srv/garba-partner/current/apps/{web,admin}/dist` |

Then it runs `nginx -t`. On failure it restores `garba-partner.conf.previous` and reloads nothing. On success it reloads Nginx (`--no-reload` to skip).

Ubuntu's default site (`/etc/nginx/sites-enabled/default`) does not conflict, but it answers requests for unknown host names. Remove it if this server hosts only Garba Partner: `sudo rm /etc/nginx/sites-enabled/default`.

## 4. What each server block does

**Port 80 (all three domains):** serves `/.well-known/acme-challenge/` for certificate renewal and redirects everything else to HTTPS with `301`.

**Web app (`WEB_DOMAIN`)** and **admin panel (`ADMIN_DOMAIN`)**

| Location | Behaviour |
|---|---|
| `/assets/` | Vite's hashed files: `Cache-Control: public, max-age=31536000, immutable`, not logged |
| `/index.html` | Web: `no-cache` (always revalidated, so a new release is picked up). Admin: `no-store` |
| `/` | `try_files $uri /index.html`: unknown paths render the single-page app |
| dot-files | `404` |

Neither domain proxies the API: a request for `/api/...` there returns the app page. The apps call the API domain.

**API (`API_DOMAIN`)**

| Location | Behaviour |
|---|---|
| `= /api/v1/health` | Proxied, no rate limit, not logged (uptime monitors) |
| `= /api/v1/webhooks/razorpay` | Proxied, no rate limit: Razorpay's retries must arrive. The API verifies the signature |
| `/api/v1/admin/` | Proxied with the rate limit and the optional admin allow-list (§6) |
| `/api/` | Proxied with the rate limit |
| `/socket.io/` | Proxied with WebSocket upgrade, buffering off, 75 s read timeout (longer than Socket.IO's ping cycle) |
| everything else | `404` |

`client_max_body_size 6m`: images are at most 5 MB (enforced by the API); the rest is multipart overhead.

## 5. Security settings

| Setting | Value | Reason |
|---|---|---|
| TLS | 1.2 and 1.3, modern ciphers, tickets off | Mozilla "intermediate" profile |
| `Strict-Transport-Security` | `max-age=31536000` on all three domains | Browsers refuse plain HTTP for a year. **Not** `includeSubDomains` or `preload`: other subdomains of your domain may not be HTTPS-ready. Add them only when you are sure |
| `Content-Security-Policy` (web) | `default-src 'self'`; images from Cloudinary; connections to the API domain (`https` and `wss`) and Razorpay; scripts from self and Razorpay Checkout; no framing; no plugins | Limits what an injected script could load or contact. Razorpay entries are needed for event pass payments |
| `Content-Security-Policy` (admin) | As above without Razorpay and without WebSocket | The admin panel uses neither |
| `X-Frame-Options: DENY`, `frame-ancestors 'none'` | both apps | No clickjacking |
| `Referrer-Policy` | web `strict-origin-when-cross-origin`, admin `no-referrer` | Admin URLs never leak to other sites |
| `Permissions-Policy` | geolocation and microphone off; camera only on the web app (verification selfie); payment only for Razorpay | Least privilege for browser features |
| `X-Robots-Tag: noindex` | admin and API | Never in search results |
| `X-Forwarded-For` | **replaced** with the address Nginx saw | The API trusts this header only from loopback and uses it for rate limits and audit hashes; a client cannot spoof it |
| Rate limit | `20 r/s` per IP, burst 40, status `429`, on `/api/` | First line of defence; the API has its own finer limits |
| Access log format | `gp_main`: path **without** query string, no referrer | Admin searches put phone numbers in the query string |
| `server_tokens off` | all | No version in headers or error pages |

`style-src 'unsafe-inline'` is kept because the web app sets an inline `style` attribute (a progress-bar width). Remove it from the CSP if that is ever replaced by classes. No inline scripts are used, so `script-src` has no `'unsafe-inline'`.

The API sends its own security headers (helmet). Its `Strict-Transport-Security` header is hidden in `gp-proxy.conf` and added by Nginx instead, so it is sent exactly once and also on Nginx's own error pages.

A detail that matters when editing: Nginx drops inherited `add_header` lines in any block that has its own `add_header`. That is why the `/assets/` and `/index.html` locations include the header snippet again.

## 6. Restricting the admin panel

Admins sign in with a password only, so restricting where the admin panel can be reached from is the strongest extra protection available today. Create an allow-list; the same file protects the admin domain **and** the admin API (`/api/v1/admin/` on the API domain):

```bash
sudo tee /etc/nginx/garba-partner/admin-allow.conf >/dev/null <<'EOF'
allow 203.0.113.10;      # office
allow 198.51.100.0/24;   # VPN
deny all;
EOF
sudo nginx -t && sudo systemctl reload nginx
```

Without the file both stay reachable from the internet. Record that as a decision in the [deployment checklist](production-setup.md#11-deployment-checklist). `healthcheck.sh` accepts `403` for the admin checks when it runs from an address that is not on the list.

## 7. Behind a CDN or another proxy

The configuration assumes clients connect to Nginx directly. If you put Cloudflare or a load balancer in front:

- Nginx would see the proxy's address as the client. Configure `set_real_ip_from <proxy ranges>;` and `real_ip_header` so `$remote_addr` is the real client again. Otherwise every user shares one rate limit.
- Keep the API reachable only through that proxy (firewall).

## 8. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `render-nginx.sh`: "no certificate for … yet" | Run it with `--http-only`, issue the certificate ([ssl.md](ssl.md)), then run it again |
| `502 Bad Gateway` on the API domain | The API is not running: `pm2 status`, `pm2 logs gp-api` |
| `413` on photo upload | Image above 5 MB (the app also says so) |
| Browser console: "blocked by CORS policy" | `WEB_ORIGIN`/`ADMIN_ORIGIN` in the env file do not match the address in the browser exactly (scheme, host, no trailing slash) |
| Browser console: "Refused to connect … Content Security Policy" | The bundles were built for another `API_DOMAIN` than Nginx was rendered for: deploy again, render again |
| Sign-in works but the session is lost on reload | The API domain is not under the same registrable domain as the app, or the page is not served over HTTPS |
| Chat falls back to slow polling | The WebSocket upgrade is blocked by a proxy in front; see §7 |
| Many `429` from one address | Several users behind one carrier address; see [production setup §13](production-setup.md#13-known-limitations) |
