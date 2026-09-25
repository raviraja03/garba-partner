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
| `PHONE_HASH_SECRET` | production, and to create users | — | api, seeders | ≥ 32 characters (e.g. 32 random bytes, base64). HMAC key for `users.phone_hash`. **Long-lived: rotating it requires a re-hash migration** |
| `PHONE_ENCRYPTION_KEY` | production, and to create users | — | api, seeders | 32 bytes, base64-encoded. AES-256-GCM key for `users.phone_encrypted` |
| `PHONE_ENCRYPTION_KEY_VERSION` | no | `1` | api, seeders | Stored with each ciphertext to support key rotation |

Empty values (`KEY=`) count as "not set".

### Web & Admin (public, `VITE_*`)

| Variable | Required | Default | Used by | Notes |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | no | `/api/v1` | web, admin | Same-origin path. Trailing slashes are removed. **Public: never put secrets in `VITE_*` variables** |

## 3. Planned variables (later phases)

These are listed, commented out, in `.env.example`. They **aren't read by any code yet** and will be added to the Zod schema in the phase that needs them. The full list and rules are in [system architecture §5.1](../architecture/system-architecture.md#51-environment-variables).

| Phase | Variables |
|---|---|
| Member auth | `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`, `OTP_HMAC_SECRET`, `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_OTP_TEMPLATE_ID`, `TEST_OTP_PHONES`, `TEST_OTP_CODE` |
| Admin auth | `JWT_ADMIN_ACCESS_SECRET`, `ADMIN_REFRESH_TOKEN_TTL_HOURS`, `TOTP_ENCRYPTION_KEY` |
| Media | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER_PREFIX`, `VITE_CLOUDINARY_CLOUD_NAME` |
| Realtime | `VITE_SOCKET_URL` |
| Payments (post-MVP) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |

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
