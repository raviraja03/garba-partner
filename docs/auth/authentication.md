# Authentication

> Related: [OTP flow](otp-flow.md), [Session management](session-management.md), [Authorization](authorization.md), [Security architecture](../architecture/security-architecture.md)

## 1. Overview

Garba Partner has two completely separate identities:

| | Members (web app) | Admins (admin panel) |
|---|---|---|
| Table | `users` | `admin_users` |
| Login | Mobile number + 6-digit OTP | Email + password (Argon2id) + mandatory TOTP code |
| Access token | JWT HS256, 15 min, audience `garba-partner:app`, secret `JWT_ACCESS_SECRET` | JWT HS256, 15 min, audience `garba-partner:admin`, secret `JWT_ADMIN_ACCESS_SECRET` |
| Refresh token | Random 256-bit, `gp_rt` httpOnly cookie, 30 days, rotating | Random 256-bit, `gp_admin_rt` httpOnly cookie, 12 h absolute + 30 min idle, rotating |
| Session table | `user_sessions` | `admin_sessions` |
| Endpoints | `/api/v1/auth/*` | `/api/v1/admin/auth/*` |
| Middleware | `authenticateMember` | `authenticateAdmin` + `requirePermission()` |

A member token can never authenticate an admin route, and the reverse also holds. Different secrets and audiences guarantee that, and tests cover it.

### Code map

| Concern | File |
|---|---|
| Member auth routes / controller / service | `apps/api/src/modules/auth/auth.{routes,controller,service}.ts` |
| OTP issuing, checking and rate limits | `apps/api/src/modules/auth/otp.service.ts` |
| JWT signing and verification (`jose`) | `apps/api/src/modules/auth/token.service.ts` |
| Admin auth routes / controller / service | `apps/api/src/modules/admin/auth/admin-auth.*.ts` |
| TOTP (RFC 6238) | `apps/api/src/lib/totp.ts` |
| Admin account management (2FA reset) | `apps/api/src/modules/admin/admins/admin-admins.routes.ts` |
| Authentication middleware | `apps/api/src/middlewares/authenticate.ts` |
| Authorization middleware | `apps/api/src/middlewares/authorize.ts` |
| CSRF guard for the refresh endpoints | `apps/api/src/middlewares/csrf.ts` |
| IP rate limiters | `apps/api/src/middlewares/rate-limit.ts` |
| SMS providers (dev only for now) | `apps/api/src/providers/sms/` |
| Shared contracts (schemas, DTOs, error codes, limits) | `packages/shared/src/{schemas/auth.schema,types/dto/auth.dto,constants/*}.ts` |
| Web: login, OTP, auth state, guards | `apps/web/src/{pages,features/auth}/` |
| Admin: login, guards, layout | `apps/admin/src/{pages,features/auth}/` |

## 2. Member endpoints

All responses use the standard envelope (`{ success, message, data }` or `{ success: false, message, error: { code, details } }`). Every auth response carries `Cache-Control: no-store`.

### 2.1 `POST /api/v1/auth/send-otp`

Sends a login code. Anyone can call it: the endpoint is the same for sign-up and login.

**Request**

```json
{ "phone": "98765 43210" }
```

`phone` accepts `9876543210`, `+91 98765 43210`, `919876543210` or `09876543210`. It's normalised to E.164 (`+919876543210`). Only Indian mobile numbers (starting with 6–9) are accepted.

**200 OK**

```json
{
  "success": true,
  "message": "If this number can receive codes, one has been sent.",
  "data": {
    "expiresInSeconds": 300,
    "resendAvailableInSeconds": 30,
    "devOtp": "482913"
  }
}
```

- The response is **identical for new, existing and banned numbers** (banned numbers silently get no SMS).
- `devOtp` is present **only** with `SMS_PROVIDER=dev` and `APP_ENV=development` ([OTP flow §4](otp-flow.md#4-development-otp-mechanism)). It is never present in staging or production.

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Not a valid Indian mobile number (`details[0].path = "phone"`) |
| 429 | `RATE_LIMITED` | Resend cooldown (30 s), 5/hour or 10/day per number, 20/hour per IP, 10/minute per IP burst. Includes a `Retry-After` header |
| 503 | `SERVICE_UNAVAILABLE` | The SMS provider failed |

### 2.2 `POST /api/v1/auth/verify-otp`

**Request**

```json
{ "phone": "9876543210", "code": "482913" }
```

**200 OK** (sets the `gp_rt` cookie)

```http
Set-Cookie: gp_rt=<opaque>; Path=/api/v1/auth; Expires=<30 days>; HttpOnly; Secure; SameSite=Strict
```

```json
{
  "success": true,
  "message": "Logged in",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "accessTokenExpiresAt": "2026-09-25T12:03:17.000Z",
    "user": {
      "id": "ef867012-efbb-4687-b3af-7a8eedb24ef9",
      "status": "active",
      "onboardingStatus": "incomplete",
      "photoVerified": false,
      "displayName": null
    }
  }
}
```

A first successful verification creates the account (the phone is stored only as an HMAC hash plus AES-GCM ciphertext). The phone number is never included in any response.

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed phone or code (not 6 digits) |
| 400 | `OTP_INVALID` | Wrong code (the message says how many attempts are left), or no active code for this number |
| 400 | `OTP_EXPIRED` | The code is older than 5 minutes |
| 400 | `OTP_ATTEMPTS_EXCEEDED` | 5 wrong attempts. The code is invalidated and a new one must be requested |
| 403 | `ACCOUNT_BANNED` | The account is banned (no session is created) |
| 429 | `RATE_LIMITED` | More than 30 verify calls per IP in 15 min |

### 2.3 `POST /api/v1/auth/refresh`

Exchanges the refresh cookie for a new access token and **rotates** the refresh token.

**Request**: no body. The browser sends the `gp_rt` cookie automatically (its path is `/api/v1/auth`). The request must include:

```http
X-Requested-With: gp-web
```

**200 OK**: same shape as verify-otp (new `accessToken`, new `gp_rt` cookie).

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `REFRESH_INVALID` | Missing/unknown/expired/revoked token, banned account, or reuse of a rotated token (which revokes the session). The cookie is cleared |
| 403 | `FORBIDDEN` | Missing `X-Requested-With: gp-web`, or an `Origin` other than `WEB_ORIGIN` |
| 429 | `RATE_LIMITED` | More than 60 refreshes per IP in 15 min |

### 2.4 `POST /api/v1/auth/logout`

**Request** (requires `Authorization: Bearer <accessToken>`)

```json
{ "allDevices": false }
```

The body is optional. `allDevices: true` revokes every session of the account ("log out of all devices").

**200 OK**: `{ "success": true, "message": "Logged out", "data": null }`. The `gp_rt` cookie is cleared. The access token stops working **immediately**, because every request checks the session.

**Errors**: `401 UNAUTHENTICATED` (no or invalid token), `400 VALIDATION_ERROR` (unknown body keys).

### 2.5 `GET /api/v1/auth/me`

**Request**: `Authorization: Bearer <accessToken>`

**200 OK**

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "ef867012-efbb-4687-b3af-7a8eedb24ef9",
    "status": "active",
    "onboardingStatus": "incomplete",
    "photoVerified": false,
    "displayName": null
  }
}
```

Suspended and pending-deletion members can call `/me`, so the app can show their status screen. Banned members get `403 ACCOUNT_BANNED`.

**Errors**: `401 UNAUTHENTICATED`, `403 ACCOUNT_BANNED`.

## 3. Admin endpoints

### 3.1 Admin sign-in (password + mandatory two-factor)

Admin sign-in always takes **two steps**. A correct password alone never creates a session: it returns a short-lived **challenge**, and only a valid 6-digit code from an authenticator app (TOTP, RFC 6238) turns that challenge into a session.

```
POST /admin/auth/login           email + password        → challenge { method: "totp" | "setup" }
POST /admin/auth/login/totp-setup challenge (setup only)  → { secret, otpauthUri }   (first sign-in)
POST /admin/auth/login/verify    challenge + 6-digit code → session + gp_admin_rt cookie
```

- **Challenge token:** 256-bit random (43 base64url characters). Only its SHA-256 hash is stored (`admin_login_challenges`). It expires after **5 minutes**, allows **5 code attempts**, is single-use, and a new password step invalidates any older challenge for that admin.
- **Enrolment:** an admin with no authenticator gets `method: "setup"`. `totp-setup` returns a new 160-bit base32 secret (the same one if called again for that challenge) and an `otpauth://` URI. The secret is stored **encrypted** (AES-256-GCM, `TOTP_ENCRYPTION_KEY`) on the challenge until the first valid code confirms it; only then is it saved on `admin_users`.
- **Codes:** 6 digits, 30-second steps, ±1 step tolerance, constant-time comparison. The last accepted step is stored (`totp_last_step`), so a code can't be replayed, even within its validity window.
- **Lockout:** wrong passwords and wrong codes both count towards the **5 failures → 15 min lock** (`admin.lockout` is audit-logged, open challenges are cancelled).
- **Audit:** `admin.login`, `admin.totp_enrolled`, `admin.lockout` and `admin.logout` are written to `admin_audit_logs`.
- **Lost authenticator:** another super admin calls `POST /api/v1/admin/admins/:adminId/reset-two-factor` (`admins:manage`, body `{ "reason": "…" }`). It clears the secret, ends all the admin's sessions and is audit-logged. Admins can't reset their own.

#### `POST /api/v1/admin/auth/login`

**Request**

```json
{ "email": "superadmin@garbapartner.test", "password": "••••••••••••" }
```

The email is trimmed and lower-cased.

**200 OK** (no cookie is set)

```json
{
  "success": true,
  "message": "Enter the code from your authenticator app",
  "data": {
    "challengeToken": "q0cS1l0m0cJ3lq6y4q2y1dQm3O8V7Y0a4a1X9oM0mZs",
    "method": "totp",
    "expiresAt": "2026-10-03T12:05:00.000Z"
  }
}
```

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed email or empty password |
| 401 | `INVALID_CREDENTIALS` | Wrong password, unknown email or disabled admin. The response and timing are the same in all three cases |
| 423 | `ACCOUNT_LOCKED` | 5 consecutive failures (password or code) lock the account for 15 min (`Retry-After` header). The correct password is refused while locked |
| 429 | `RATE_LIMITED` | More than 10 login attempts per IP in 15 min |

#### `POST /api/v1/admin/auth/login/totp-setup`

**Request**: `{ "challengeToken": "…" }` (a `setup` challenge).

**200 OK**

```json
{
  "success": true,
  "message": "Add this account to your authenticator app",
  "data": {
    "secret": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
    "otpauthUri": "otpauth://totp/Garba%20Partner%20Admin%3Asuperadmin%40garbapartner.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Garba%20Partner%20Admin&algorithm=SHA1&digits=6&period=30"
  }
}
```

**Errors**: `401 MFA_CHALLENGE_INVALID` (unknown, expired, used, or a `totp` challenge: an enrolled admin can never swap their authenticator here), `429 RATE_LIMITED` (30 per IP / 15 min, shared with `verify`).

#### `POST /api/v1/admin/auth/login/verify`

**Request**

```json
{ "challengeToken": "q0cS1l0m0cJ3lq6y4q2y1dQm3O8V7Y0a4a1X9oM0mZs", "code": "492039" }
```

**200 OK** (sets `gp_admin_rt`, `Path=/api/v1/admin/auth`, 12 h)

```json
{
  "success": true,
  "message": "Logged in",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "accessTokenExpiresAt": "2026-09-25T12:03:35.000Z",
    "admin": {
      "id": "b2e0d4ef-0001-4000-8000-000000000001",
      "email": "superadmin@garbapartner.test",
      "name": "Dev Super Admin",
      "role": "super_admin",
      "permissions": ["dashboard:view", "users:view", "…", "admins:manage"]
    }
  }
}
```

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | The code isn't 6 digits, or the token is malformed |
| 401 | `MFA_CODE_INVALID` | Wrong, expired or replayed code (the challenge stays usable until 5 attempts) |
| 401 | `MFA_CHALLENGE_INVALID` | Unknown, expired or used challenge, or 5 wrong codes: start again with the password |
| 423 | `ACCOUNT_LOCKED` | The account reached 5 failures |
| 429 | `RATE_LIMITED` | 30 per IP / 15 min |

The admin panel's sign-in page ([LoginPage.tsx](../../apps/admin/src/pages/LoginPage.tsx)) walks through the steps: password → (first time) the secret, grouped for manual entry, plus an "open in authenticator app" link → code. There is deliberately no QR code library (no extra dependency); a QR code is a possible later improvement.

### 3.2 `POST /api/v1/admin/auth/refresh`

Same as the member refresh, but with the `gp_admin_rt` cookie and the header `X-Requested-With: gp-admin`. It also enforces the **30-minute idle timeout**: if the last refresh was more than 30 min ago, the session is revoked (`idle_timeout`) and the call returns `401 REFRESH_INVALID`.

### 3.3 `POST /api/v1/admin/auth/logout`

Requires `Authorization: Bearer <admin accessToken>`. Revokes the session, clears the cookie and writes `admin.logout` to the audit log. Returns `200` with `data: null`.

### 3.4 `GET /api/v1/admin/auth/me`

Requires an admin access token. Returns `AdminMeDto` (`id`, `email`, `name`, `role`, `permissions`). A disabled admin's tokens stop working immediately (`401`).

## 4. Rate limits

| Endpoint | Limit | Store |
|---|---|---|
| `send-otp` | 30 s cooldown per number; 5/hour and 10/day per number; 20/hour per IP | **PostgreSQL** (`otp_requests`), which survives restarts |
| `send-otp` | 10/minute per IP (burst) | In-memory |
| `verify-otp` | 5 attempts per code; 30 calls per IP / 15 min | PostgreSQL / in-memory |
| `refresh` (member & admin) | 60 per IP / 15 min | In-memory |
| `admin/auth/login` | 10 per IP / 15 min + lockout after 5 failures per account | In-memory + PostgreSQL |
| `admin/auth/login/totp-setup`, `login/verify` | 30 per IP / 15 min; 5 codes per challenge; failures count towards the account lockout | In-memory + PostgreSQL |
| Every `/api/v1` route except webhooks | 300 per IP / minute (global ceiling) | In-memory |

Behind Nginx, `trust proxy` is `loopback`, so the limits apply to the real client IP. IPs are only ever stored as HMACs.

## 5. Local development

- **Member login:** use any Indian-looking number, e.g. `98765 00123`. No SMS is sent. The OTP screen shows the code in a "Development only" banner.
- **Admin login:** `npm run db:seed` creates three development admins with the password **`garba-dev-admin-2026`**. This works only on a development database, because the seeder refuses to run unless `APP_ENV=development`. On the first sign-in each admin enrols an authenticator app (any TOTP app works). To start again, reset them with `npm run db:reset`, or have another super admin call `reset-two-factor`.

| Email | Role |
|---|---|
| `superadmin@garbapartner.test` | `super_admin` |
| `moderator@garbapartner.test` | `moderator` |
| `events@garbapartner.test` | `event_manager` |

- **Real admins** (any environment, including production bootstrap):

  ```bash
  npm run admin:create -- --email ops@example.com --name "Ops Lead" --role super_admin
  ```

  This prints a random 24-character password **once** to the terminal. It's never logged or stored in plaintext.

## 6. Testing

| Test file | Covers |
|---|---|
| `apps/api/src/modules/auth/auth.int.test.ts` | send-otp (hash-only storage, dev code only in development, identical responses, cooldown); verify-otp (**valid**, **invalid**, **expired**, **too many attempts**, replay, banned); **unauthorized** access (no token, forged, wrong audience); **logout** (single and all devices); **refresh** (rotation, reuse detection, grace window, CSRF, expiry) |
| `apps/api/src/modules/admin/auth/admin-auth.int.test.ts` | Two-step admin sign-in (no session from the password alone, enrolment, encrypted secret, single-use challenge, replay, expiry), lockout via passwords and via codes, generic failures, audit entries, token separation, logout, refresh + idle timeout, disabled admins |
| `apps/api/src/lib/totp.test.ts` | RFC 6238 test vectors, base32, ±1 step window, replay refusal |
| `apps/api/src/security/security.int.test.ts` | 2FA reset (super admin only, never self, ends sessions, audited), plus the cross-cutting security sweep |
| `apps/api/src/modules/auth/token.service.test.ts` | Audience separation, tampered/unsigned/expired tokens, no personal data in claims |
| `apps/api/src/middlewares/authorize.test.ts` | Permission matrix and member status gate |
| `packages/shared/test/phone.test.ts` | Phone normalisation and auth schemas |

Integration tests need `TEST_DATABASE_URL` ([database setup](../database/database-setup.md)). Run everything with `npm run test`.

## 7. Known limitations (to address before launch)

- **Admin TOTP (2FA)** is implemented (§3.1). A **forced password change on first login** is not implemented yet: admins created with `admin:create` keep the printed password until they change it through a future admin-management screen. Deliver the password over a secure channel.
- **No production SMS provider yet.** Only `SMS_PROVIDER=dev` exists, and it is rejected outside `APP_ENV=development`, so staging and production cannot start until a real provider (e.g. MSG91 with DLT templates) is added.
- The admin API isn't restricted to the admin host in the application; restrict it in Nginx ([security best practices §5](../security/security-best-practices.md#5-nginx-and-deployment-assumptions)).
- In-memory rate limiters reset on restart and aren't shared between processes. The OTP limits are DB-backed, and the rest move to Redis when scaling out.
