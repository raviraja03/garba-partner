# Environment Variables

> Related: [Local development](local-development.md), [System architecture §5.1](../architecture/system-architecture.md#51-environment-variables), [Security architecture §10](../architecture/security-architecture.md#10-secrets-and-cryptography)

## 1. How environment configuration works

- There's **one** env file for the whole monorepo: `.env` at the repository root. It's **git-ignored** and must never be committed.
- `.env.example` is committed. It documents every variable with safe placeholder values and no secrets.
- **API:** `apps/api/src/config/env.ts` calls `loadServerEnv()` from `@garba-partner/config/server`. It:
  1. reads the root `.env` if it exists (real environment variables **take precedence** over the file),
  2. validates everything with a Zod schema (`packages/config/src/server/env.ts`),
  3. **refuses to start** if anything is invalid, printing variable names only and never values.
- **Web/Admin:** Vite loads env files from the repo root (`envDir`). Only variables prefixed `VITE_` reach browser code, and they're validated by `loadClientEnv()` from `@garba-partner/config/client`.
- Vite configs also read `API_*` variables (Node side only) to point the dev proxy at the API.

## 2. Variables in use (current phase)

### Runtime

| Variable | Required | Default | Allowed values | Used by | Notes |
|---|---|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test`, `production` | api | **Don't set it in `.env`** ([why](#why-node_env-is-not-in-env)). Set by PM2 in production and by the shell when needed |
| `APP_ENV` | no | `development` | `development`, `staging`, `production` | api | The deployment environment. `production` requires `NODE_ENV=production` and `https://` origins |
| `LOG_LEVEL` | no | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` | api | Pretty logs in development, JSON otherwise |
| `LOG_API_REQUESTS` | no | `true` | `true`, `false` | api | One `[API]` line per request in the server log ([logging](../development/logging.md)) |
| `LOG_API_TO_DATABASE` | no | `true` | `true`, `false` | api | Also store each request in the `api_logs` table (batched, never blocks a request) |
| `API_LOG_RETENTION_DAYS` | no | `30` | `1`–`365` | api | `api_logs` rows older than this are deleted daily |
| `LOG_OTP` | no | `false` | `true`, `false` | api | Prints each one-time login code to the server log (phone masked). **Debugging only**: anyone who can read the log can sign in as that member |

### API

| Variable | Required | Default | Used by | Notes |
|---|---|---|---|---|
| `API_HOST` | no | `127.0.0.1` | api, web/admin dev proxy | Keep it on loopback. Nginx is the public entry point in production |
| `API_PORT` | no | `4000` | api, web/admin dev proxy | Integer 1–65535 |
| `WEB_ORIGIN` | no | `http://localhost:5173` | api (CORS) | Origin of the member web app. Must be `https://` when `APP_ENV=production` |
| `ADMIN_ORIGIN` | no | `http://localhost:5174` | api (CORS) | Origin of the admin panel. Must be `https://` when `APP_ENV=production` |

### Database

Setup guide: [docs/database/database-setup.md](../database/database-setup.md).

| Variable | Required | Default | Used by | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | **yes** | — | api, db CLI | `postgres://user:password@host:5432/db`. The API refuses to start without it. URL-encode special characters in the password |
| `DATABASE_MIGRATION_URL` | no | `DATABASE_URL` | db CLI | Owner role for migrations in production (least privilege: the API uses a DML-only role) |
| `DATABASE_SSL` | no | `false` | api, db CLI | `true` for managed databases that require TLS (certificate verified) |
| `DATABASE_POOL_MAX` | no | `10` | api | 1–100 |
| `TEST_DATABASE_URL` | no | — | integration tests | **Disposable** database (tests migrate it down/up and truncate tables). Must differ from `DATABASE_URL`. Integration tests are skipped when unset |

### Phone number protection

| Variable | Required | Default | Used by | Notes |
|---|---|---|---|---|
| `PHONE_HASH_SECRET` | **yes** | — | api, seeders | ≥ 32 characters (e.g. 32 random bytes, base64). HMAC key for `users.phone_hash`. **Long-lived: rotating it requires a re-hash migration** |
| `PHONE_ENCRYPTION_KEY` | **yes** | — | api, seeders | 32 bytes, base64-encoded. AES-256-GCM key for `users.phone_encrypted` |
| `PHONE_ENCRYPTION_KEY_VERSION` | no | `1` | api, seeders | Stored with each ciphertext to support key rotation |

### Authentication

Details: [docs/auth/](../auth/authentication.md).

| Variable | Required | Default | Used by | Notes |
|---|---|---|---|---|
| `OTP_HMAC_SECRET` | **yes** | — | api | ≥ 32 characters. HMAC key for stored OTP codes and client-IP hashes |
| `SMS_PROVIDER` | no | `dev` | api | Who delivers login codes (the name is historical). `dev` = nothing is sent, and the code is returned in the send-otp response; **only accepted when `APP_ENV=development`** (boot fails otherwise). `msg91_whatsapp` = a WhatsApp message through MSG91 ([setup](../notifications/msg91.md)). `msg91` (SMS) is switched off and refused |
| `MSG91_AUTH_KEY` | if MSG91 is used | — | api | **Secret.** MSG91 auth key. Sent only in a request header |
| `MSG91_WHATSAPP_OTP_TEMPLATE` | if `SMS_PROVIDER=msg91_whatsapp` | — | api | Name of the approved WhatsApp "Authentication" template that carries the login code |
| `MSG91_WHATSAPP_OTP_COPY_BUTTON` | no | `true` | api | `false` only if that template has no "Copy code" button |
| `MSG91_OTP_TEMPLATE_ID` | no | — | api | SMS login-code template. Unused while the SMS option is switched off |
| `MESSAGING_PROVIDER` | no | `log` | api | Who delivers notifications by SMS / WhatsApp. `log` writes them to the server log (development only); `msg91` sends them |
| `MSG91_SMS_TEMPLATE_IDS` | if `SMS_ENABLED` with MSG91 | — | api | `type:templateId` pairs, comma-separated. Unlisted notification types are not sent |
| `MSG91_WHATSAPP_NUMBER` | if `SMS_PROVIDER=msg91_whatsapp`, or `WHATSAPP_ENABLED` with MSG91 | — | api | WhatsApp Business number connected in MSG91, digits with country code |
| `MSG91_WHATSAPP_TEMPLATES` | if `WHATSAPP_ENABLED` with MSG91 | — | api | `type:templateName` pairs, comma-separated |
| `MSG91_WHATSAPP_LANGUAGE` | no | `en` | api | Template language code |
| `MSG91_WHATSAPP_NAMESPACE` | no | — | api | Only if MSG91 shows a namespace for your templates |
| `SMS_ENABLED` | no | `false` | api | Also send notifications by SMS ([notification channels](../notifications/notification-channels.md)). Outside development it needs `MESSAGING_PROVIDER=msg91` |
| `WHATSAPP_ENABLED` | no | `false` | api | Same, for WhatsApp |
| `JWT_ACCESS_SECRET` | **yes** | — | api | ≥ 32 characters. Signs member access tokens |
| `JWT_ADMIN_ACCESS_SECRET` | **yes** | — | api | ≥ 32 characters. Signs admin access tokens. **Must differ** from `JWT_ACCESS_SECRET` |
| `ACCESS_TOKEN_TTL_SECONDS` | no | `900` | api | 60–3600 |
| `REFRESH_TOKEN_TTL_DAYS` | no | `30` | api | 1–90 (absolute member session lifetime) |
| `ADMIN_ACCESS_TOKEN_TTL_SECONDS` | no | `900` | api | 60–3600 |
| `ADMIN_SESSION_TTL_HOURS` | no | `12` | api | 1–24 (absolute admin session lifetime) |
| `ADMIN_SESSION_IDLE_MINUTES` | no | `30` | api | 5–240 |

Empty values (`KEY=`) count as "not set". Generate every secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.

### Profile images

Details: [docs/users/cloudinary.md](../users/cloudinary.md).

| Variable | Required | Default | Used by | Notes |
|---|---|---|---|---|
| `MEDIA_STORAGE` | no | `local` | api | `cloudinary` \| `local`. **`local` (disk + served by the API) is only accepted when `APP_ENV=development`** |
| `CLOUDINARY_CLOUD_NAME` | with `cloudinary` | — | api | |
| `CLOUDINARY_API_KEY` | with `cloudinary` | — | api | |
| `CLOUDINARY_API_SECRET` | with `cloudinary` | — | api | **Secret**, server only |
| `CLOUDINARY_FOLDER_PREFIX` | no | `garba-partner` | api | Assets go to `<prefix>/<APP_ENV>/profile-images/` |

### Event pass payments

Details: [Razorpay](../payments/razorpay.md).

| Variable | Required | Default | Used by | Notes |
|---|---|---|---|---|
| `PAYMENT_PROVIDER` | no | `disabled` | api | `disabled` \| `razorpay`. Disabled: `/orders` and the webhook return `503` |
| `RAZORPAY_KEY_ID` | with `razorpay` | — | api | Public key ID sent to Checkout. **`rzp_test_` except in `APP_ENV=production`, which requires `rzp_live_`** |
| `RAZORPAY_KEY_SECRET` | with `razorpay` | — | api | **Secret**, server only (API auth, checkout signatures) |
| `RAZORPAY_WEBHOOK_SECRET` | with `razorpay` | — | api | **Secret**, server only. Must differ from the key secret |

### Web & Admin (public, `VITE_*`)

| Variable | Required | Default | Used by | Notes |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | no | `/api/v1` | web, admin | A same-origin path in development (the Vite dev server proxies it), or the absolute URL on the API domain in production (`https://<API_DOMAIN>/api/v1`). Baked into the bundles at build time. Socket.IO connects to the same origin. Trailing slashes are removed. **Public: never put secrets in `VITE_*` variables** |

## 3. Planned variables (later phases)

These are listed, commented out, in `.env.example`. They **aren't read by any code yet** and will be added to the Zod schema in the phase that needs them. The full list and rules are in [system architecture §5.1](../architecture/system-architecture.md#51-environment-variables).

| Phase | Variables |
|---|---|

Generate secrets with a CSPRNG, e.g. `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.

## 4. Adding a new variable

In the **same PR**:

1. Add it to the schema in `packages/config/src/server/env.ts` (server) or `packages/config/src/client/index.ts` (browser, `VITE_` prefix only).
2. Add it to `.env.example` with a safe placeholder and a comment.
3. Document it in this file (and in system architecture §5.1 if it's a deployment concern).
4. If it's a secret: never log it, never give it a `VITE_` prefix, and add its key name to the logger redaction list if it could appear in request data.

## Why `NODE_ENV` is not in `.env`

Vite also reads the root `.env`. If `NODE_ENV=development` is set there, `vite build` produces a **development build of React** (about 450 kB instead of about 240 kB, with dev-only warnings). So:

- **Local development:** leave it unset. The API defaults to `development`, and Vite picks the right mode per command.
- **Production:** PM2 sets `NODE_ENV=production` for the API process.
- **Tests:** Vitest sets `NODE_ENV=test`.

## 5. Security rules

- `.env` and every `.env.*` file except `.env.example` are git-ignored. **Never commit secrets.** If one is committed, rotate it immediately ([git workflow §9](../development/git-workflow.md#9-secrets-and-sensitive-data-in-git)).
- In production, `.env` lives only on the server, owned by the app user with mode `600`.
- Validation errors print variable **names**, never values.

## 6. Production

The server has one env file, `/etc/garba-partner/production.env` (owner `root:<deploy group>`, mode `640`), created from [`deploy/env/production.env.example`](../../deploy/env/production.env.example). It holds everything in §2 **plus** the deployment variables below. The API ignores keys it does not know, and only `VITE_*` keys reach the browser bundles. Procedure: [production setup §4](../deployment/production-setup.md#4-environment-file).

Check a file before starting anything: `npm run env:check -w @garba-partner/api` (development) or `NODE_ENV=production npm run env:check:prod -w @garba-partner/api` (built release). It runs the API's own validation and prints the non-secret settings.

### Deployment variables (read by the scripts in `deploy/`, not by the API)

| Variable | Required | Example | Used by | Notes |
|---|---|---|---|---|
| `WEB_DOMAIN` | **yes** | `garbamates.in` | Nginx templates, TLS, health checks | Lowercase hostname only |
| `ADMIN_DOMAIN` | **yes** | `admin.garbamates.in` | same | |
| `API_DOMAIN` | **yes** | `api.garbamates.in` | same | Must share the registrable domain of the other two |
| `LETSENCRYPT_EMAIL` | **yes** | `ops@garbamates.in` | certbot | Account contact |
| `BACKUP_DIR` | no | `/var/backups/garba-partner` | `backup-db.sh` | Mode `700` |
| `BACKUP_RETENTION_DAYS` | no | `14` | `backup-db.sh` | Local copies only |
| `BACKUP_GPG_RECIPIENT` | **yes** in production | `backups@garbamates.in` | `backup-db.sh` | **Public** key to encrypt for. Empty → the backup is refused |
| `BACKUP_RCLONE_REMOTE` | recommended | `b2:garbamates-backups/db` | `backup-db.sh` | Off-site copy |

### Values that must agree

`preflight.sh` fails when they don't:

| Variable | Must equal |
|---|---|
| `WEB_ORIGIN` | `https://<WEB_DOMAIN>` |
| `ADMIN_ORIGIN` | `https://<ADMIN_DOMAIN>` |
| `VITE_API_BASE_URL` | `https://<API_DOMAIN>/api/v1` |
| `APP_ENV` | `production` |
| `API_HOST` | `127.0.0.1` |
| `MEDIA_STORAGE` | `cloudinary` |
| `DATABASE_MIGRATION_URL` | set, and different from `DATABASE_URL` (owner role vs DML-only role) |

### Production rules

- `NODE_ENV` is **not** in the file: PM2 sets `NODE_ENV=production` ([`ecosystem.config.cjs`](../../ecosystem.config.cjs)), and the scripts set it for the CLI commands.
- Format: one `KEY=value` per line, no quotes, no spaces around `=`; URL-encode special characters in database passwords. The deploy scripts read single keys from the file and never execute it.
- `SMS_PROVIDER`: must be `msg91_whatsapp` (with `MSG91_AUTH_KEY`, `MSG91_WHATSAPP_NUMBER` and `MSG91_WHATSAPP_OTP_TEMPLATE`); `dev` is refused outside development. See [MSG91 setup](../notifications/msg91.md).
- Razorpay: live keys (`rzp_live_`) are required in production and refused elsewhere.
- Optional path overrides for the scripts (environment of the shell, not the file): `GP_ENV_FILE`, `GP_ROOT` (`/srv/garba-partner`), `GP_LOG_DIR` (`/var/log/garba-partner`), `GP_CERT_NAME`, `GP_ACME_ROOT`, `GP_KEEP_RELEASES` (5).
