# System Architecture — Garba Partner

> Related: [Application architecture](application-architecture.md), [Database architecture](database-architecture.md), [Security architecture](security-architecture.md)

## 1. Overview

Garba Partner is a **modular monolith**: one Express API (REST + Socket.IO), one PostgreSQL database, and two static React SPAs (member web app and admin panel). Everything runs on a single VPS behind Nginx, with PM2 as the process manager. External services handle SMS (OTP) and image storage (Cloudinary). Payments (Razorpay) come later.

This is deliberately simple. The seams that allow scaling later (stateless API, domain modules, Socket.IO adapter, job worker) are described in [§8](#8-scalability-and-future-considerations). None of that scaling infrastructure is built for the MVP.

## 2. System context

```mermaid
flowchart TB
    member([Member<br/>mobile browser])
    visitor([Visitor])
    admin([Admin staff])

    subgraph GP[Garba Partner]
        web[Web SPA<br/>apps/web]
        adm[Admin SPA<br/>apps/admin]
        api[API + Socket.IO<br/>apps/api]
        worker[Job worker<br/>apps/api worker entry]
        db[(PostgreSQL)]
    end

    sms[SMS provider<br/>OTP, DLT]
    cld[Cloudinary<br/>images]
    rzp[Razorpay<br/>post-MVP]

    visitor --> web
    member --> web
    admin --> adm
    web -->|HTTPS /api/v1, WSS /socket.io| api
    adm -->|HTTPS /api/v1/admin| api
    api --> db
    worker --> db
    api --> sms
    api -->|signed server-side uploads| cld
    worker -->|asset deletion| cld
    web -->|image delivery CDN| cld
    adm -->|signed URLs for private assets| cld
    api -.->|orders, webhooks| rzp
```

## 3. Containers

| Container | Tech | Responsibility | Runs as |
|---|---|---|---|
| **Web app** (`apps/web`) | React + Vite + TS + Tailwind | Member UI: onboarding, events, discovery, interests, chat, settings, safety centre | Static files served by Nginx |
| **Admin app** (`apps/admin`) | React + Vite + TS + Tailwind | Moderation, verification, events, users, audit | Static files served by Nginx on the admin subdomain |
| **API** (`apps/api`, `src/server.ts`) | Node.js LTS + Express 5 + TS + Sequelize + Socket.IO | REST API (`/api/v1`), admin API (`/api/v1/admin`), realtime chat/notifications | PM2 process `gp-api` (fork mode, 1 instance in the MVP) |
| **Worker** (`apps/api`, `src/worker.ts`) | Same codebase, `node-cron` | Scheduled jobs (§6) | PM2 process `gp-worker` (1 instance) |
| **Database** | PostgreSQL 16+ | System of record | systemd service, bound to `127.0.0.1` |
| **Shared package** (`packages/shared`) | TS | Types, enums, constants, Zod schemas, error codes, socket event contracts | Build-time dependency |
| **Config package** (`packages/config`) | TS | Env schema/loader, tsconfig/ESLint/Prettier/Tailwind presets | Build-time dependency |

**Why a separate worker process?** Scheduled jobs must run exactly once. Keeping them out of the API process means the API can later be scaled to several instances without jobs running twice, and a slow job can't block request handling.

## 4. Deployment topology (VPS)

```mermaid
flowchart LR
    internet((Internet)) -->|443| nginx
    subgraph VPS[Ubuntu LTS VPS]
        nginx[Nginx<br/>TLS termination]
        webstatic[/var/www/gp-web<br/>static build/]
        admstatic[/var/www/gp-admin<br/>static build/]
        subgraph PM2
            apip[gp-api :4000<br/>127.0.0.1 only]
            wrk[gp-worker]
        end
        pg[(PostgreSQL :5432<br/>127.0.0.1 only)]
        nginx --> webstatic
        nginx --> admstatic
        nginx -->|/api, /socket.io| apip
        apip --> pg
        wrk --> pg
    end
    backup[(Off-site encrypted<br/>backup storage)]
    pg -.->|nightly pg_dump| backup
```

### 4.1 Domains and routing

Domain placeholder: `garbapartner.example`. Replace it when decided.

| Host | Path | Target |
|---|---|---|
| `garbapartner.example` (+ `www` → 301) | `/` | Web SPA (`try_files $uri /index.html`) |
| | `/api/` | `http://127.0.0.1:4000` |
| | `/socket.io/` | `http://127.0.0.1:4000` with WebSocket upgrade headers |
| `admin.garbapartner.example` | `/` | Admin SPA |
| | `/api/v1/admin/`, `/api/v1/health` | `http://127.0.0.1:4000` (**only** the admin API prefix and the health check are proxied on this host) |

**Why same-origin API?** The web app and API share an origin, and so do the admin app and the admin API. Refresh-token cookies can then be host-only with `SameSite=Strict`, CORS is not needed in production, and CSRF exposure is minimal. The API still has a strict CORS allow-list for local development.

The API also rejects admin routes that arrive on the member host, and member routes that arrive on the admin host (a `Host` header check in middleware), as defence in depth.

### 4.2 Nginx responsibilities

- TLS 1.2+ with Let's Encrypt (certbot auto-renew), HTTP → HTTPS redirect, HSTS.
- Security headers for static apps: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera allowed only for self, for the verification selfie; geolocation denied), `frame-ancestors 'none'`.
- Long cache headers for hashed Vite assets (`/assets/*`: `Cache-Control: public, max-age=31536000, immutable`). `index.html` is `no-cache`.
- `client_max_body_size 6m` (photo uploads ≤ 5 MB plus multipart overhead).
- A coarse per-IP rate limit (`limit_req`) on `/api/` as the first line of defence. The fine-grained limits live in the API.
- `proxy_set_header X-Forwarded-For / X-Forwarded-Proto / Host`. Express `trust proxy` is set to `loopback`.
- Optional: IP allow-list or basic auth in front of the admin host as an extra layer (not a replacement for admin auth).
- Gzip/Brotli for text assets.

### 4.3 PM2

`ecosystem.config.cjs` at the repo root (created in Phase 6):

| App | Script | Mode | Instances | Notes |
|---|---|---|---|---|
| `gp-api` | `apps/api/dist/server.js` | fork | 1 | `max_memory_restart: 512M`, graceful shutdown (`kill_timeout: 10000`), listens on `127.0.0.1:4000` |
| `gp-worker` | `apps/api/dist/worker.js` | fork | 1 | Must always be exactly 1 instance |

- `pm2 startup` + `pm2 save` so processes survive reboots. `pm2-logrotate` for log rotation.
- The API handles `SIGTERM`/`SIGINT`: it stops accepting connections, closes Socket.IO, drains in-flight requests and closes the DB pool.

### 4.4 Server hardening (VPS)

- Ubuntu LTS with unattended security upgrades.
- SSH: key-only, no root login, non-default user, `fail2ban`.
- UFW: allow 22 (optionally restricted to known IPs), 80 and 443 only.
- PostgreSQL and the API bind to `127.0.0.1`. Nothing else is exposed.
- The app runs as a dedicated unprivileged user (`gp`). `.env` is owned by `gp` with mode `600`.

### 4.5 Deployment process (MVP)

1. CI passes on `main`, and a release tag `vX.Y.Z` is created (see [git workflow](../development/git-workflow.md)).
2. On the server, in a new release directory: `git fetch --tags && git checkout vX.Y.Z` → `npm ci` → `npm run build`.
3. **Back up the database** → run migrations (`npm run db:migrate -w apps/api`).
4. Switch the symlink `/srv/garba-partner/current` → the new release. `pm2 reload ecosystem.config.cjs`.
5. Copy the web/admin `dist` folders to the Nginx roots (or point Nginx at `current/apps/*/dist`).
6. Smoke test: `GET /api/v1/health`, log in with a test account, open a chat.
7. Rollback: point the symlink back and `pm2 reload`. Migrations must be backward compatible for one release (expand → migrate → contract), so the previous release keeps working. A destructive down-migration is a manual, approved step.

A scripted deploy (shell script or GitHub Actions over SSH) can be added once the manual steps are stable.

## 5. Environments

| Env | Purpose | Data | SMS | Cloudinary |
|---|---|---|---|---|
| `development` | Local dev | Seed data only | **Test mode**: allow-listed test numbers with a fixed code from env. Real SMS off | Dev folder prefix `garba-partner/development/` |
| `test` | Automated tests | Ephemeral DB per run | Mock provider | Mocked |
| `staging` (optional in the MVP, recommended before launch) | Pre-release verification | Synthetic data. **Never production data** | Real provider, internal numbers only | `garba-partner/staging/` |
| `production` | Live | Real | Real provider. Test-number mode **cannot** be enabled (the env validator fails at boot) | `garba-partner/production/` |

### 5.1 Environment variables

There's one root `.env` (git-ignored) and `.env.example` (committed, with no secrets). The API loads and validates env with the schema in `packages/config`. Vite apps read only `VITE_*` variables through `envDir` set to the repo root. **Secrets never get a `VITE_` prefix.**

| Variable | Used by | Example / notes |
|---|---|---|
| `NODE_ENV` | api | `development` \| `test` \| `production`. **Set by the runtime (PM2, test runner), never in `.env`**, because Vite reads `.env` files and would otherwise produce development React builds. The API defaults to `development` |
| `APP_ENV` | api | `development` \| `staging` \| `production` (controls feature guards such as test OTP) |
| `API_PORT` | api | `4000` |
| `API_HOST` | api | `127.0.0.1` |
| `WEB_ORIGIN` | api | `https://garbapartner.example`. Used for CORS/Origin checks and Host routing |
| `ADMIN_ORIGIN` | api | `https://admin.garbapartner.example` |
| `DATABASE_URL` | api | `postgres://gp_app:***@127.0.0.1:5432/garba_partner` |
| `DATABASE_SSL` | api | `false` locally, `true` for managed DBs |
| `DATABASE_POOL_MAX` | api | `10` |
| `JWT_ACCESS_SECRET` | api | ≥ 32 random bytes (member tokens) |
| `JWT_ADMIN_ACCESS_SECRET` | api | ≥ 32 random bytes, **different** from the member secret |
| `ACCESS_TOKEN_TTL_SECONDS` | api | `900` |
| `REFRESH_TOKEN_TTL_DAYS` | api | `30` |
| `ADMIN_REFRESH_TOKEN_TTL_HOURS` | api | `12` |
| `OTP_HMAC_SECRET` | api | ≥ 32 random bytes |
| `PHONE_HASH_SECRET` | api | ≥ 32 random bytes. **Never rotate without a re-hash migration** |
| `PHONE_ENCRYPTION_KEY` | api | 32-byte key, base64 (AES-256-GCM) |
| `PHONE_ENCRYPTION_KEY_VERSION` | api | `1` |
| `TOTP_ENCRYPTION_KEY` | api | 32-byte key, base64 (encrypts admin TOTP secrets) |
| `SMS_PROVIDER` | api | `msg91` \| `twilio` \| `mock` (`mock` is rejected when `APP_ENV=production`) |
| `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_OTP_TEMPLATE_ID` | api | Provider credentials / DLT IDs |
| `TEST_OTP_PHONES` | api | Comma-separated E.164 numbers. **Rejected when `APP_ENV=production`** |
| `TEST_OTP_CODE` | api | 6 digits. Only with `TEST_OTP_PHONES` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | api | Cloudinary credentials |
| `CLOUDINARY_FOLDER_PREFIX` | api | `garba-partner/production` |
| `LOG_LEVEL` | api | `info` in production |
| `VITE_API_BASE_URL` | web, admin | `/api/v1` (same origin). `http://localhost:4000/api/v1` in dev if not proxied |
| `VITE_SOCKET_URL` | web | `/` (same origin) |
| `VITE_CLOUDINARY_CLOUD_NAME` | web, admin | Public cloud name, used only to build delivery URLs |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | api | **Post-MVP.** Not present in MVP `.env.example` |

In local dev, Vite's dev server proxies `/api` and `/socket.io` to `localhost:4000`, so the same-origin cookie setup works just as it does in production.

## 6. Scheduled jobs (worker)

All jobs are **idempotent**, process rows in batches (≤ 500 per run) and log counts only, never PII.

| Job | Schedule | Action |
|---|---|---|
| `expire-interests` | every 15 min | `pending` interests past `expires_at` → `expired` |
| `lift-suspensions` | every 5 min | Suspensions with `ends_at < now()` and no other active sanction → user `status = active` |
| `expire-verification-requests` | hourly | `pending` > 7 days → `expired`. `initiated` > 24 h → `expired` |
| `purge-verification-selfies` | daily 03:00 IST | Delete Cloudinary selfie assets where the decision is > 30 days old. Set `user_verifications.evidence_deleted_at` and null `evidence_reference` |
| `purge-otp-requests` | hourly | Delete `otp_requests` older than 24 h |
| `purge-sessions` | daily | Delete sessions expired or revoked > 7 days ago |
| `purge-ended-match-messages` | daily | Delete messages of matches ended > 90 days ago, **except** messages referenced by report snapshots (snapshots are copies, so the originals can go) |
| `process-account-deletions` | daily 02:00 IST | Accounts `pending_deletion` > 30 days → purge/anonymise ([user flows §11](../product/user-flows.md#11-account-settings-and-deletion-flow)) |
| `purge-notifications` | daily | Delete read notifications > 90 days old |
| `purge-rejected-photos` | daily | Destroy Cloudinary assets of photos rejected > 30 days ago and delete the rows |

A `job_runs` table isn't needed for the MVP. Jobs log start/end/count to the structured log. If a job fails, it logs at `error` level, which triggers the alert.

## 7. Observability and operations

| Concern | MVP approach |
|---|---|
| **Logging** | `pino` JSON logs to stdout → PM2 log files → `pm2-logrotate` (keep 14 days locally). **Redaction** of `authorization`, `cookie`, `set-cookie`, `phone`, `otp`, `code`, `password`, `token`, `body.message` (chat) paths. Every log line carries a request ID (`X-Request-Id`, generated if missing) |
| **Error tracking** | Optional: Sentry (or similar) with PII scrubbing and `sendDefaultPii: false`. Must be disclosed in the privacy policy if used |
| **Uptime** | External uptime check on `/api/v1/health` (returns `{status, db: 'ok'}` only) |
| **Metrics** | MVP: admin dashboard counts plus server metrics (CPU, RAM, disk) from the VPS provider. Alerts on disk > 80%, API down, 5xx error rate spike |
| **Backups** | Nightly `pg_dump -Fc` → encrypted (e.g. `age`/GPG) → off-site object storage. Keep 7 daily, 4 weekly, 3 monthly. **Quarterly restore drill.** WAL-based point-in-time recovery when moving to managed Postgres |
| **Cloudinary** | Assets are recoverable only if not deleted. Deletion is intentional (privacy). No separate image backup |
| **Runbooks** (`docs/runbooks/`, written in Phase 6) | Deploy, rollback, restore, rotate secrets, handle a data breach, handle a law-enforcement request, P0 safety incident |

## 8. Scalability and future considerations

### 8.1 Expected MVP load (assumption)

- Up to tens of thousands of registered users in the first season. A peak of ~2,000 concurrent socket connections on Navratri evenings.
- One 4 vCPU / 8 GB VPS with a single API process and on-box PostgreSQL is expected to handle this, **if** the indexes in [database architecture](database-architecture.md) are in place. **Validate with a load test in Phase 6.**

### 8.2 Seams that already exist in the MVP (cheap now, valuable later)

| Seam | How it's kept |
|---|---|
| **Stateless API** | No in-memory session state. Auth is JWT plus DB session rows. Uploads go straight to Cloudinary. Any node can serve any request |
| **Socket routing by user room** | Emits target `user:{userId}` rooms. This works unchanged across nodes once the Redis adapter is added |
| **Worker separated** | Jobs never run in the API process |
| **Domain modules** | Code organised by domain (`auth`, `profiles`, `events`, `discovery`, `interests`, `matches`, `chat`, `safety`, `admin`…). A domain could be extracted later without rewriting it |
| **Provider interfaces** | `SmsProvider`, `MediaStorage` (Cloudinary), later `PaymentProvider`. Swappable without touching business logic |
| **Rate-limit store abstraction** | `express-rate-limit` with the in-memory store in the MVP. It can switch to a Redis store with no code changes in routes. OTP limits are DB-backed from day one, so restarts can't reset them |
| **Cursor pagination everywhere** | No `OFFSET` scans on growing tables |

### 8.3 Scaling path (build only when metrics show the need)

| Trigger | Step |
|---|---|
| API CPU > 70% sustained at peak | PM2 cluster mode or multiple instances + **`@socket.io/redis-adapter`** + Nginx sticky sessions (`ip_hash` or cookie-based) for Socket.IO + Redis store for rate limits. Introduce Redis at this point |
| DB CPU/IO bottleneck | Move to managed PostgreSQL (PITR, replicas). Read replica for discovery/admin reads. Tune indexes based on `pg_stat_statements` |
| Discovery query slow | Precomputed `discoverable_profiles` materialised view refreshed on change, or a denormalised table maintained by the service |
| Message table very large | Partition `messages` by month (declarative partitioning). Archive old partitions |
| Notifications for offline users | Web push (VAPID) via a queue (BullMQ on Redis) processed by the worker |
| Payments (Razorpay) | New `payments` domain module. Webhook endpoint with raw-body signature verification. Idempotent processing keyed on the Razorpay event ID |
| Multi-region / very high scale | Out of scope. Revisit only with real data |

### 8.4 Seasonality

Traffic is concentrated around the nine nights of Navratri, especially evenings (18:00–01:00 IST).

- Freeze deploys during Navratri except for hotfixes.
- Temporarily scale the VPS vertically before the season (resize) and scale back afterwards.
- Plan moderation staffing for peak hours (P0 SLA < 1 h).
