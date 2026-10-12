# Authentication

> Related: [Firebase Phone Authentication](firebase-phone-auth.md), [Sign-in flow](otp-flow.md), [Session management](session-management.md), [Authorization](authorization.md), [Security architecture](../architecture/security-architecture.md)

## 1. Overview

Garba Partner has two completely separate identities:

| | Members (web app) | Admins (admin panel) |
|---|---|---|
| Table | `users` | `admin_users` |
| Login | Mobile number + 6-digit SMS code (Firebase Phone Authentication) | Email + password (Argon2id) |
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
| Firebase ID token verification (phone sign-in) | `apps/api/src/providers/firebase/phone-token.verifier.ts` |
| JWT signing and verification (`jose`) | `apps/api/src/modules/auth/token.service.ts` |
| Admin auth routes / controller / service | `apps/api/src/modules/admin/auth/admin-auth.*.ts` |
| Authentication middleware | `apps/api/src/middlewares/authenticate.ts` |
| Authorization middleware | `apps/api/src/middlewares/authorize.ts` |
| CSRF guard for the refresh endpoints | `apps/api/src/middlewares/csrf.ts` |
| IP rate limiters | `apps/api/src/middlewares/rate-limit.ts` |
| Shared contracts (schemas, DTOs, error codes, limits) | `packages/shared/src/{schemas/auth.schema,types/dto/auth.dto,constants/*}.ts` |
| Web: login and code screens, Firebase flow, auth state, guards | `apps/web/src/{pages,features/auth}/` |
| Admin: login, guards, layout | `apps/admin/src/{pages,features/auth}/` |

## 2. Member endpoints

All responses use the standard envelope (`{ success, message, data }` or `{ success: false, message, error: { code, details } }`). Every auth response carries `Cache-Control: no-store`.

### 2.1 `POST /api/v1/auth/phone`

Starts a session from a Firebase ID token. The browser gets that token from Firebase after the member enters the SMS code ([sign-in flow](otp-flow.md)). The endpoint is the same for sign-up and login. Full details: [Firebase Phone Authentication §3–4](firebase-phone-auth.md#3-api).

**Request**

```json
{ "idToken": "<Firebase ID token>" }
```

Only `idToken` is allowed. The phone number is read from the verified token: a `phone`, `uid`, `role` or any other field in the body is rejected.

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

A first successful sign-in creates the account (the phone is stored only as an HMAC hash plus AES-GCM ciphertext). The phone number is never included in any response. Accounts are matched by phone number, so members who joined before Firebase keep their account.

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `idToken` missing or malformed, or extra fields in the body |
| 401 | `PHONE_VERIFICATION_FAILED` | The token is forged, expired, from another Firebase project, not from a phone sign-in, older than 5 minutes, or for a non-Indian number. The response does not say which |
| 403 | `ACCOUNT_BANNED` | The account is banned (no session is created) |
| 429 | `RATE_LIMITED` | More than 30 calls per IP in 15 min |
| 503 | `SERVICE_UNAVAILABLE` | Google's signing keys could not be fetched |

### 2.2 Removed endpoints

`POST /api/v1/auth/send-otp` and `POST /api/v1/auth/verify-otp` no longer exist (404). The API does not send or check login codes.

### 2.3 `POST /api/v1/auth/refresh`

Exchanges the refresh cookie for a new access token and **rotates** the refresh token.

**Request**: no body. The browser sends the `gp_rt` cookie automatically (its path is `/api/v1/auth`). The request must include:

```http
X-Requested-With: gp-web
```

**200 OK**: same shape as `POST /auth/phone` (new `accessToken`, new `gp_rt` cookie).

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

### 3.1 `POST /api/v1/admin/auth/login`

Admins sign in with **email and password**. There is no second factor: authenticator (TOTP) sign-in was built and then **removed** on request (migration `20261004100000-remove-admin-two-factor` drops its table and columns). See [security checklist §5](../security/security-checklist.md#5-before-launch-open-items) for the resulting risk.

**Request**

```json
{ "email": "superadmin@garbapartner.test", "password": "••••••••••••" }
```

The email is trimmed and lower-cased.

**200 OK** (sets `gp_admin_rt`, `Path=/api/v1/admin/auth`, 12 h; `Cache-Control: no-store`)

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

A successful sign-in resets the failure counter, records `last_login_at` and writes `admin.login` to the audit log.

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed email or empty password |
| 401 | `INVALID_CREDENTIALS` | Wrong password, unknown email or disabled admin. The response and timing are the same in all three cases |
| 423 | `ACCOUNT_LOCKED` | 5 consecutive wrong passwords lock the account for 15 min (`Retry-After` header; `admin.lockout` audited). The correct password is refused while locked |
| 429 | `RATE_LIMITED` | More than 10 login attempts per IP in 15 min |

### 3.2 `POST /api/v1/admin/auth/refresh`

Same as the member refresh, but with the `gp_admin_rt` cookie and the header `X-Requested-With: gp-admin`. It also enforces the **30-minute idle timeout**: if the last refresh was more than 30 min ago, the session is revoked (`idle_timeout`) and the call returns `401 REFRESH_INVALID`.

### 3.3 `POST /api/v1/admin/auth/logout`

Requires `Authorization: Bearer <admin accessToken>`. Revokes the session, clears the cookie and writes `admin.logout` to the audit log. Returns `200` with `data: null`.

### 3.4 `GET /api/v1/admin/auth/me`

Requires an admin access token. Returns `AdminMeDto` (`id`, `email`, `name`, `role`, `permissions`). A disabled admin's tokens stop working immediately (`401`).

## 4. Rate limits

| Endpoint | Limit | Store |
|---|---|---|
| `auth/phone` | 30 per IP / 15 min. Firebase applies its own limits per number, device and project before a token exists | In-memory (ours) |
| `refresh` (member & admin) | 60 per IP / 15 min | In-memory |
| `admin/auth/login` | 10 per IP / 15 min + lockout after 5 failures per account | In-memory + PostgreSQL |
| Every `/api/v1` route except webhooks | 300 per IP / minute (global ceiling) | In-memory |

Behind Nginx, `trust proxy` is `loopback`, so the limits apply to the real client IP. IPs are only ever stored as HMACs.

## 5. Local development

- **Member login:** add a test phone number in the Firebase console and sign in with it and its fixed code. No SMS is sent for test numbers. There is no on-screen development code ([guide §7](firebase-phone-auth.md#7-local-development)).
- **Admin login:** `npm run db:seed` creates three development admins with the password **`garba-dev-admin-2026`**. This works only on a development database, because the seeder refuses to run unless `APP_ENV=development`. Email and password are all that is needed (§3.1).

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
| `apps/api/src/modules/auth/auth.int.test.ts` | `auth/phone` with tokens from a stand-in for Firebase and the real verifier (**valid**, **forged**, **expired**, **wrong project**, **no phone**, **replayed**, non-Indian number, extra body fields, existing member keeps the account, concurrent first sign-ins, banned, keys unavailable, rate limit, old endpoints gone); **unauthorized** access (no token, forged, wrong audience); **logout** (single and all devices); **refresh** (rotation, reuse detection, grace window, CSRF, expiry) |
| `apps/api/src/providers/firebase/phone-token.verifier.test.ts` | Every token check, including unsigned and HS256 tokens and unreachable keys |
| `apps/web/src/features/auth/phone-sign-in.test.ts` | The browser flow against a fake Firebase SDK: send, resend, wrong and expired codes, reCAPTCHA failure and retry, error messages |
| `apps/api/src/modules/admin/auth/admin-auth.int.test.ts` | Admin password sign-in (session, cookie flags, audit), no two-factor endpoints, lockout, generic failures, token separation, logout (audited), refresh + idle timeout, disabled admins |
| `apps/api/src/modules/auth/token.service.test.ts` | Audience separation, tampered/unsigned/expired tokens, no personal data in claims |
| `apps/api/src/middlewares/authorize.test.ts` | Permission matrix and member status gate |
| `packages/shared/test/phone.test.ts` | Phone normalisation and auth schemas |

Integration tests need `TEST_DATABASE_URL` ([database setup](../database/database-setup.md)). Run everything with `npm run test`.

## 7. Known limitations (to address before launch)

- **No admin second factor.** Admin sign-in is email + password only (authenticator sign-in was removed), so a leaked or guessed admin password gives full access. A **forced password change on first login** is not implemented either: admins created with `admin:create` keep the printed password until they change it through a future admin-management screen. Deliver the password over a secure channel.
- **Sign-in depends on Firebase and has not been verified with a real SMS.** The Firebase console must be set up (phone sign-in enabled, authorized domains, billing) and the first-login check done on the live site ([guide §5 and §9](firebase-phone-auth.md#5-firebase-console-setup)). SMS is billed per message and there is no fallback channel if one does not arrive.
- The admin API is reachable on the API domain and is not restricted by host in the application; restrict it by IP in Nginx where possible ([nginx.md §6](../deployment/nginx.md#6-restricting-the-admin-panel)).
- In-memory rate limiters reset on restart and aren't shared between processes. They move to Redis when scaling out.
