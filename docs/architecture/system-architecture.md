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
| **Scheduled jobs** (`apps/api`) | In the API process (timers) | Sanction expiry, event reminders, notification retention, payment reconciliation (§6) | Part of `gp-api`: exactly one instance ([PM2](../deployment/pm2.md)) |
| **Database** | PostgreSQL 16+ | System of record | systemd service, bound to `127.0.0.1` |
| **Shared package** (`packages/shared`) | TS | Types, enums, constants, Zod schemas, error codes, socket event contracts | Build-time dependency |
| **Config package** (`packages/config`) | TS | Env schema/loader, tsconfig/ESLint/Prettier/Tailwind presets | Build-time dependency |

**Why a separate worker process?** Scheduled jobs must run exactly once. Keeping them out of the API process means the API can later be scaled to several instances without jobs running twice, and a slow job can't block request handling.

## 4. Deployment topology (VPS)

The deployment is implemented in [`deploy/`](../../deploy/) and documented in [docs/deployment/](../deployment/production-setup.md). This section is the summary.

```mermaid
flowchart LR
    internet((Internet)) -->|443| nginx
    subgraph VPS[Ubuntu LTS VPS]
        nginx[Nginx<br/>TLS termination]
        webstatic[/current/apps/web/dist<br/>static build/]
        admstatic[/current/apps/admin/dist<br/>static build/]
        subgraph PM2
            apip[gp-api :4000<br/>127.0.0.1 only<br/>REST + Socket.IO + jobs]
        end
        pg[(PostgreSQL :5432<br/>127.0.0.1 only)]
        nginx -->|WEB_DOMAIN| webstatic
        nginx -->|ADMIN_DOMAIN| admstatic
        nginx -->|API_DOMAIN: /api, /socket.io| apip
        apip --> pg
    end
    backup[(Off-site encrypted<br/>backup storage)]
    pg -.->|nightly pg_dump| backup
```

### 4.1 Domains and routing

Three domains under one registrable domain, set in the server's env file (never in code). Example: `garbamates.in`.

| Variable | Example | Target |
|---|---|---|
| `WEB_DOMAIN` | `garbamates.in` | Web SPA: static files, `try_files $uri /index.html` |
| `ADMIN_DOMAIN` | `admin.garbamates.in` | Admin SPA: static files, optional IP allow-list |
| `API_DOMAIN` | `api.garbamates.in` | `/api/` and `/socket.io/` → `http://127.0.0.1:4000`; everything else `404` |

**The API has its own domain** (this replaced the earlier same-origin plan, where each app's host proxied `/api`). The browser apps call the API domain directly:

- Cross-origin but **same-site**: the refresh cookies stay host-only on the API domain with `HttpOnly; Secure; SameSite=Strict`, and are sent because all three hosts share one registrable domain. An API on an unrelated domain would break sessions.
- The API's CORS allow-list is exactly `WEB_ORIGIN` and `ADMIN_ORIGIN`, with fixed methods and headers; cookie endpoints also require the CSRF header and a matching `Origin`. This is now a production control, not only a development one.
- The admin API (`/api/v1/admin/`) is reachable on the API domain. It is protected by admin authentication and permissions; Nginx can additionally restrict it, together with the admin panel, to an IP allow-list ([nginx.md §6](../deployment/nginx.md#6-restricting-the-admin-panel)). The API does not check the `Host` header.

In local development the Vite dev servers proxy `/api` and `/socket.io`, so the apps use a same-origin path there.

### 4.2 Nginx responsibilities

Details: [nginx.md](../deployment/nginx.md).

- TLS 1.2+ with Let's Encrypt (certbot auto-renew), HTTP → HTTPS redirect, HSTS.
- Security headers for the static apps: `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera only for the web app, geolocation denied), no framing.
- Long cache headers for hashed Vite assets (`/assets/*`); `index.html` is revalidated.
- `client_max_body_size 6m` on the API domain (photo uploads ≤ 5 MB plus multipart overhead).
- A coarse per-IP rate limit (`limit_req`) on `/api/`. The fine-grained limits live in the API.
- `X-Forwarded-For` is replaced with the address Nginx saw. Express `trust proxy` is `loopback`.
- Access logs without query strings (admin searches carry phone numbers).
- Optional IP allow-list for the admin panel and the admin API.

### 4.3 PM2

[`ecosystem.config.cjs`](../../ecosystem.config.cjs) at the repo root. Details: [pm2.md](../deployment/pm2.md).

| App | Script | Mode | Instances | Notes |
|---|---|---|---|---|
| `gp-api` | `apps/api/dist/server.js` | fork | **1** | `wait_ready`, `max_memory_restart: 512M`, graceful shutdown (`kill_timeout: 12000`), listens on `127.0.0.1:4000`. Runs the scheduled jobs too, so it must stay one instance |

- `pm2 startup` + `pm2 save` so the process survives reboots. Logs are rotated by `logrotate`.
- The API handles `SIGTERM`/`SIGINT`: it stops the jobs, closes Socket.IO, drains in-flight requests and closes the DB pool.

### 4.4 Server hardening (VPS)

- Ubuntu LTS with unattended security upgrades.
- SSH: key-only, no root login, non-default user, `fail2ban`.
- UFW: allow 22 (optionally restricted to known IPs), 80 and 443 only.
- PostgreSQL and the API bind to `127.0.0.1`. Nothing else is exposed.
- The app runs as a dedicated unprivileged user (`gp`). `.env` is owned by `gp` with mode `600`.

### 4.5 Deployment process

Scripted in [`deploy/scripts/deploy.sh`](../../deploy/scripts/deploy.sh); the full procedure and checklist are in [production setup](../deployment/production-setup.md).

1. `npm run check` passes on the commit; a release tag `vX.Y.Z` is created (see [git workflow](../development/git-workflow.md)).
2. On the server, `deploy.sh vX.Y.Z`: new release directory → `npm ci` → build → preflight → **encrypted database backup** → migrations → switch the `current` symlink → restart the API → health check.
3. An unhealthy release is rolled back automatically (code only). Migrations must be backward compatible for one release (expand → migrate → contract): see [rollback](../deployment/rollback.md).
4. `healthcheck.sh` verifies the public side (TLS, headers, CORS, Socket.IO). A deployment is complete only when it passes.

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
| `WEB_ORIGIN` | api | `https://<WEB_DOMAIN>`. Used for CORS and CSRF `Origin` checks |
| `ADMIN_ORIGIN` | api | `https://<ADMIN_DOMAIN>` |
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
| `SMS_PROVIDER` | api | `dev` today (no SMS; code returned in the response, **only accepted when `APP_ENV=development`**). A real provider (e.g. `msg91`) is added before launch |
| `SMS_PROVIDER`, `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID` | api | SMS provider, its credential and the DLT-approved login-code template ([MSG91 setup](../notifications/msg91.md)) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | api | Cloudinary credentials |
| `CLOUDINARY_FOLDER_PREFIX` | api | `garba-partner/production` |
| `LOG_LEVEL` | api | `info` in production |
| `VITE_API_BASE_URL` | web, admin | `/api/v1` in development (Vite proxy). `https://<API_DOMAIN>/api/v1` in production. Socket.IO connects to the same origin as this URL |
| `VITE_CLOUDINARY_CLOUD_NAME` | web, admin | Public cloud name, used only to build delivery URLs |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | api | **Post-MVP.** Not present in MVP `.env.example` |

In local dev, Vite's dev server proxies `/api` and `/socket.io` to `localhost:4000` (same-origin). In production the apps call the API domain; the deployment variables (`WEB_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN`, backups) are in [environment variables §6](../setup/environment-variables.md#6-production).

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
| **Logging** | `pino` JSON logs to stdout → PM2 log files → `logrotate` (keep 14 days locally; [production setup §10](../deployment/production-setup.md#10-logging)). **Redaction** of `authorization`, `cookie`, `set-cookie`, `phone`, `otp`, `code`, `password`, `token`, `body.message` (chat) paths. Every log line carries a request ID (`X-Request-Id`, generated if missing) |
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
