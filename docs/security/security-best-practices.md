# Security Best Practices

> Related: [Security checklist](security-checklist.md), [Threat model](threat-model.md), [Security architecture](../architecture/security-architecture.md), [Development rules](../development/development-rules.md), [Coding standards](../development/coding-standards.md)

## 1. Purpose

These are the rules for everyone who writes code for, deploys or operates Garba Partner. They explain **how** to keep the controls in the [security checklist](security-checklist.md) true as the code grows. A PR that breaks one of these rules needs an explicit, documented reason.

## 2. API rules

### 2.1 Every endpoint

1. **Authenticate:** `authenticateMember` or `authenticateAdmin`. An unauthenticated endpoint must be justified in its doc (like `send-otp`) and rate-limited.
2. **Authorize:** members → `requireActiveMember` (or `requireMemberStatus` for the few routes suspended members may use); admins → `requirePermission('<permission>')`. Check **permissions**, never role names.
3. **Validate** every body, query and path parameter with a strict shared zod schema through `parseInput`. Never read `req.body.x` directly.
4. **Scope every query by the caller** (`WHERE user_id = :me`, or a membership check). For someone else's resource return `404`, not `403`, so IDs can't be probed.
5. **Respect blocks and sanctions:** anything that shows one member to another, or lets them interact, must use the safety checks (`isBlockedEitherWay`, status checks). Add a test that a blocked or suspended member is refused.
6. **Rate-limit** anything that sends SMS, costs money, creates content or can be brute-forced. Key limits by phone, code or user ID where possible, not only by IP.
7. **Add the route to the sweep lists** in `apps/api/src/security/security.int.test.ts` (`MEMBER_ENDPOINTS` / `ADMIN_ENDPOINTS`) and, for admin routes, to the role matrix.

### 2.2 Responses and errors

- Use `ok()` / `okPaginated()` and throw `AppError(code, …)`. Never send an error body by hand.
- Messages are for users: no SQL, stack traces, provider errors, file paths or IDs of other members.
- Every API response is `Cache-Control: no-store` by default. Only public, non-personal lists (events, cities) may set a public cache.
- Map models to **DTOs** explicitly. Never return a Sequelize instance or `toJSON()`. Member-facing DTOs must never contain phone numbers, date of birth, exact location or last-seen (`lib/pii-guards.ts`).
- Keep identical responses where a difference would reveal something (unknown vs banned phone; unknown vs disabled admin).

### 2.3 Database

- Every schema change is a migration with a working `down`, tested up → down → up.
- User values only through `replacements` / bind parameters. Interpolate **only** server constants (column names from an allow-list, fixed SQL fragments).
- Wrap multi-step changes in a transaction; lock rows (`FOR UPDATE`) that decide money, counters or one-time tokens.
- Store secrets and one-time tokens **hashed** (SHA-256 for random tokens, HMAC for low-entropy values like OTPs and phone numbers) and personal data that must be read back **encrypted** (AES-256-GCM, `lib/crypto.ts`). One key per purpose.
- Sensitive columns are excluded from the default model scope (`passwordHash`); use an explicit scope to read them.
- Never modify production data with ad-hoc scripts. Destructive CLI commands are development-only.

### 2.4 Logging

- Log events, not data: IDs and codes, never phone numbers, OTPs, tokens, passwords, message text or search terms.
- The logger redacts known keys (`lib/logger.ts`) and query parameters (`redactUrl`). When you add a sensitive field or query parameter, **add it to the redaction list** in the same PR.
- Database errors are logged without SQL text, bind values or constraint details. Don't log a Sequelize error's `sql` yourself.
- Client IPs are stored only as HMACs (audit log, OTP limits).

### 2.5 Audit

- Every admin write calls `recordAdminAction(…)` **inside the same transaction** as the change, with a `reason` where the action affects a member.
- Authentication events for admins (sign-in, lockout, logout) are audited. Keep it that way for any new admin auth flow.
- The audit log is append-only; never add an update or delete path.

### 2.6 Files and media

- Accept uploads only through `middlewares/upload.ts` (one file, size limit, JPEG/PNG/WebP).
- Always decode and **re-encode** with sharp (`lib/image.ts`): this strips EXIF/GPS and neutralises polyglots. Never store or serve the original bytes. Never use the client's filename.
- Cloudinary uploads are server-side and signed, with random public IDs and `overwrite: false`. Never create unsigned upload presets.
- Don't collect identity documents. If a provider is added, store only its status, reference and failure reason.

### 2.7 Realtime

- Every socket event handler goes through the common wrapper (payload validation, rate limit, live session check). Never trust a room name or match ID from the client without checking membership on the server.

### 2.8 Payments

- Never trust the client's payment status or amount. Amounts come from our database; status comes from verified signatures and webhooks.
- Webhooks: verify the HMAC over the **raw body**, de-duplicate by event ID, make handlers idempotent. Details: [webhook](../payments/webhook.md).

## 3. Frontend rules (web and admin)

- Access tokens live **in memory** only. Never put tokens, phone numbers or profile data in `localStorage`, `sessionStorage` or URLs.
- Never use `dangerouslySetInnerHTML`. Render user content as text. Links from user content must be `https://` and use `rel="noopener noreferrer"`.
- `VITE_*` variables are public: never put secrets in them.
- Client-side guards (`RequireAuth`, `RequireAdmin`) are UX. The API decides.
- Don't load third-party scripts except Razorpay Checkout (loaded only when a member starts a payment). Any new origin needs a CSP change (§5).
- Admin sign-in is email + password only. Use strong, unique passwords (a password manager) for every admin account.

## 4. Secrets and keys

| Secret | Purpose | Must differ from | Rotation notes |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | Member access tokens | `JWT_ADMIN_ACCESS_SECRET` | Rotating invalidates current access tokens at once; clients get new ones through refresh |
| `JWT_ADMIN_ACCESS_SECRET` | Admin access tokens | `JWT_ACCESS_SECRET` | Same |
| `PHONE_HASH_SECRET` | Phone lookups (HMAC) | — | Needs a re-hash migration |
| `PHONE_ENCRYPTION_KEY` (+ `_VERSION`) | Phone ciphertext | — | Versioned: re-encrypt in the background |
| `OTP_HMAC_SECRET` | OTP hashes, IP HMACs, audit IP hashes | — | Invalidates pending OTPs (5 min) |
| `CLOUDINARY_API_SECRET`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Providers | Webhook ≠ key secret | Rotate in the provider dashboard first |

Rules:

- Generate with a CSPRNG: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
- Different values per environment. Never reuse development or test values.
- Never commit `.env`; only `.env.example` with empty placeholders. The API refuses to boot with missing, short or duplicated keys.
- Store production secrets in a secret store or a root-owned env file readable only by the service user.
- If a secret leaks: rotate it, revoke affected sessions, and follow [incident response](../safety/incident-response.md).

## 5. Nginx and deployment assumptions

The API trusts `X-Forwarded-For` **only from loopback** (`trust proxy = loopback`) and listens on `127.0.0.1` by default (`API_HOST`). This is safe only if Nginx on the same host is the sole public entry point. The API does **not** check the `Host` header, so Nginx must keep the admin API off the public web host.

Example configuration (adapt names, paths and certificates; test with `nginx -t`):

```nginx
# /etc/nginx/conf.d/garba-partner.conf

limit_req_zone $binary_remote_addr zone=gp_api:10m rate=20r/s;

map $http_upgrade $connection_upgrade { default upgrade; '' close; }

upstream gp_api { server 127.0.0.1:4000; keepalive 32; }

# Shared TLS settings
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
server_tokens off;

# HTTP → HTTPS
server {
  listen 80;
  server_name garbapartner.example admin.garbapartner.example;
  return 301 https://$host$request_uri;
}

# ---- Web app (members) ----
server {
  listen 443 ssl http2;
  server_name garbapartner.example;
  ssl_certificate     /etc/letsencrypt/live/garbapartner.example/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/garbapartner.example/privkey.pem;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header Content-Security-Policy "default-src 'self'; img-src 'self' https://res.cloudinary.com data: blob:; connect-src 'self' wss://garbapartner.example https://api.razorpay.com https://lumberjack.razorpay.com; script-src 'self' https://checkout.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "geolocation=(), microphone=(), camera=(self), payment=(self \"https://api.razorpay.com\")" always;
  add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;

  root /srv/garba-partner/web;          # apps/web/dist
  location / { try_files $uri /index.html; }
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable" always; }

  # The admin API is never served on the public web host.
  location /api/v1/admin/ { return 404; }

  location /api/ {
    limit_req zone=gp_api burst=40 nodelay;
    client_max_body_size 6m;            # profile/event images (5 MB) + multipart overhead
    proxy_pass http://gp_api;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_hide_header X-Powered-By;
  }

  location /socket.io/ {
    proxy_pass http://gp_api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 75s;
  }
}

# ---- Admin panel ----
server {
  listen 443 ssl http2;
  server_name admin.garbapartner.example;
  ssl_certificate     /etc/letsencrypt/live/admin.garbapartner.example/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/admin.garbapartner.example/privkey.pem;

  # Optional but recommended: office/VPN allow-list.
  # allow 203.0.113.0/24; deny all;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header Content-Security-Policy "default-src 'self'; img-src 'self' https://res.cloudinary.com data: blob:; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "no-referrer" always;
  add_header X-Robots-Tag "noindex, nofollow" always;

  root /srv/garba-partner/admin;        # apps/admin/dist
  location / { try_files $uri /index.html; }

  # Only what the admin panel calls.
  location ~ ^/api/v1/(admin/|cities|health) {
    limit_req zone=gp_api burst=40 nodelay;
    client_max_body_size 6m;
    proxy_pass http://gp_api;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  location /api/ { return 404; }
}
```

Assumptions and checks:

| Assumption | Why | Check |
|---|---|---|
| The API listens on `127.0.0.1` only; the firewall exposes 80/443 only | `trust proxy = loopback` would otherwise let clients spoof their IP and bypass limits | `ss -ltnp` shows `127.0.0.1:4000` |
| `X-Forwarded-For` is **appended** (`$proxy_add_x_forwarded_for`) | The API takes the address added by the trusted proxy | Rate-limit smoke test from two IPs |
| `/api/v1/admin/` returns `404` on the web host | The API does not enforce the host itself | `curl -i https://garbapartner.example/api/v1/admin/auth/me` → 404 |
| `WEB_ORIGIN` / `ADMIN_ORIGIN` are the exact `https://` origins | CORS and CSRF compare them exactly | Boot refuses `http://` in production |
| The Razorpay webhook reaches `/api/v1/webhooks/razorpay` on the web host | Payments are confirmed by webhook | Razorpay dashboard shows `2xx` |
| `client_max_body_size` ≥ the API's upload limit, but not much larger | Avoid buffering large bodies | Upload a 5 MB image |
| PostgreSQL listens on a private interface; API uses a DML-only role over TLS | Limits the blast radius of an API compromise | `DATABASE_SSL=true`, role grants reviewed |
| Only one API process runs | In-memory limiters | Before scaling out, move limiters to Redis |

If the admin panel starts calling another public route, add it to the admin host's `location` regex.

## 6. Admin operations

- **Creating admins:** `npm run admin:create -- --email … --name … --role …` prints a random password once. Give it to the person over a secure channel.
- **Compromised password:** disable the account immediately (all sessions end), then create a new one with `admin:create` and review the audit log for that admin.
- **At least two super admins**, so one can always disable another's account; super admins limited to named people.
- **Review the audit log** regularly for `admin.lockout`, unusual `admin.login` IP patterns, phone reveals and refunds.
- **Leaving staff:** disable the account (sessions end immediately); never delete it (audit references stay valid).

## 7. Dependencies

- Don't add a dependency for something small we can write and test .
- Run `npm audit --omit=dev` before every release; review moderate issues against the [accepted risks](../testing/security-testing.md#5-accepted-risks-and-follow-ups).
- Keep the lockfile committed; update dependencies deliberately, one area at a time, with the full check.

## 8. Before you open a PR

- [ ] Input validated with a shared strict schema.
- [ ] Authentication, permission/status check and caller scoping in place; blocks/sanctions respected.
- [ ] Route added to the security sweep lists (and the role matrix for admin routes).
- [ ] No personal data in DTOs, logs, error messages or URLs; new sensitive fields added to the log redaction.
- [ ] Admin writes audited in the same transaction.
- [ ] Rate limit where the endpoint sends SMS, costs money, creates content or can be guessed.
- [ ] Migration with `down`, tested up → down → up.
- [ ] Tests for the negative cases (unauthorized, forbidden, other member's resource, invalid input).
- [ ] Docs updated, including the [security checklist](security-checklist.md) if a control changed.
