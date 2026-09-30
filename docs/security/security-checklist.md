# Security Checklist

> Related: [Threat model](threat-model.md), [Security best practices](security-best-practices.md), [Security architecture](../architecture/security-architecture.md), [Security testing](../testing/security-testing.md), [Release checklist](../testing/release-checklist.md)

## 1. Purpose

This page is the **current security status** of Garba Partner (web, admin, api) after the security hardening phase. It records:

- every control that is in place, where it lives in the code and which test covers it (§2);
- how the phase requirements are met (§3);
- the issues found during hardening and how they were fixed (§4);
- what must still happen before launch (§5), and the accepted residual risks (§6).

Use it at every release together with the [release checklist](../testing/release-checklist.md). When a control changes, update this page in the same PR.

Legend: ✅ in place and tested · 🟡 in place, but depends on deployment (Nginx, secret store) · ⏳ not done yet.

## 2. Controls by area

### 2.1 Authentication

| Control | Status | Where | Test |
|---|---|---|---|
| Member sign-in by phone OTP; OTP stored as an HMAC, compared in constant time, 5-minute TTL, 5 attempts, single use | ✅ | `modules/auth/otp.service.ts` | `auth.int.test.ts` |
| OTPs are never logged; the dev SMS provider logs nothing and is refused outside `APP_ENV=development` | ✅ | `providers/sms/`, env schema | `auth.int.test.ts`, `env-rules.test.ts` |
| `send-otp` gives the same response for new, existing and banned numbers | ✅ | `auth.service.ts` | `auth.int.test.ts` |
| Admin passwords hashed with Argon2id; unknown/disabled admins run a dummy hash (same timing and response) | ✅ | `admin-auth.service.ts` | `admin-auth.int.test.ts` |
| **Mandatory admin two-factor sign-in (TOTP, RFC 6238)**: the password alone never creates a session; secret encrypted at rest (AES-256-GCM, `TOTP_ENCRYPTION_KEY`); challenge token hashed, 5 min, 5 attempts, single use; codes can't be replayed | ✅ (new) | `admin-auth.service.ts`, `lib/totp.ts` | `admin-auth.int.test.ts`, `totp.test.ts` |
| Admin lockout: 5 failed passwords **or** codes → locked 15 min, audit-logged | ✅ | `admin-auth.service.ts` | `admin-auth.int.test.ts` |
| Lost authenticator: reset only by **another** super admin; ends the admin's sessions; audit-logged | ✅ (new) | `modules/admin/admins/admin-admins.routes.ts` | `security.int.test.ts` |
| Forced password change on an admin's first sign-in | ⏳ | — | — |

### 2.2 JWT and sessions

| Control | Status | Where | Test |
|---|---|---|---|
| HS256 pinned (`algorithms: ['HS256']`), issuer and audience checked; separate secrets **and** audiences for members and admins | ✅ | `modules/auth/token.service.ts` | `token.service.test.ts`, `security.int.test.ts` |
| No personal data in JWT claims (subject + session ID only) | ✅ | `token.service.ts` | `token.service.test.ts` |
| Every request re-checks the session in the database, so logout, suspension, ban and admin disabling take effect immediately | ✅ | `middlewares/authenticate.ts` | `security.int.test.ts` |
| Access tokens live in memory only (never `localStorage`) | ✅ | `apps/{web,admin}/src/features/auth/` | review |
| Refresh tokens: random 256-bit, stored hashed, rotated, reuse detection | ✅ | `auth.service.ts`, `admin-auth.service.ts` | `auth.int.test.ts` |
| Refresh cookies `HttpOnly`, `SameSite=Strict`, `Secure` outside development, path-scoped (`/api/v1/auth`, `/api/v1/admin/auth`) | ✅ | `lib/cookies.ts` | `security.int.test.ts` (CSRF) |
| Admin sessions: 12 h absolute, 30 min idle | ✅ | `admin-auth.service.ts` | `admin-auth.int.test.ts` |

### 2.3 Authorization and admin permissions

| Control | Status | Where | Test |
|---|---|---|---|
| Every member route uses `authenticateMember` (+ `requireActiveMember` / `requireMemberStatus`) | ✅ | module routers | sweep of 46 member endpoints |
| Every admin route uses `authenticateAdmin` + `requirePermission()`; route code checks permissions, never role names | ✅ | `middlewares/authorize.ts` | sweep of 22 admin endpoints, role × permission matrix |
| Least privilege: `users:unban`, `payments:refund`, `audit:view`, `admins:manage` are super-admin only | ✅ | `packages/shared/src/constants/admin.ts` | `authorize.test.ts`, `security.int.test.ts` |
| IDOR: other members' resources return `404` (indistinguishable from missing) | ✅ | services scope every query by the caller | `security.int.test.ts`, module suites |
| Blocks and suspensions are enforced in every service and socket event | ✅ | `isBlockedEitherWay`, status checks (`modules/safety/sanctions.ts`, `requireActiveMember`) | safety, moderation and chat suites |
| Frontend guards are UX only; the server decides | ✅ | `RequireAuth`, `RequireAdmin` | — |

### 2.4 CORS, CSRF and HTTP headers

| Control | Status | Where | Test |
|---|---|---|---|
| CORS allow-list: exactly `WEB_ORIGIN` and `ADMIN_ORIGIN` (no wildcard, no prefix matching), credentials, **only** `GET POST PUT PATCH DELETE` and the headers the apps send | ✅ (tightened) | `app.ts` | `security.int.test.ts` "allows only our origins, methods and headers" |
| Socket.IO CORS: `WEB_ORIGIN` only | ✅ | `realtime/socket-server.ts` | socket suite |
| CSRF on cookie endpoints: `X-Requested-With: gp-web`/`gp-admin` **and** a matching `Origin` | ✅ | `middlewares/csrf.ts` | `security.int.test.ts` |
| helmet defaults + HSTS 1 year with sub-domains + `Referrer-Policy: no-referrer`; no `X-Powered-By` | ✅ (tightened) | `app.ts` | `security.int.test.ts` |
| **`Cache-Control: no-store` on every API response** unless a public, non-personal route opts into caching (events, cities) | ✅ (new) | `app.ts` | `security.int.test.ts` "never lets browsers or proxies cache personal responses" |
| CSP, Permissions-Policy and COOP for the web and admin apps | 🟡 | Nginx ([best practices §5](security-best-practices.md#5-nginx-and-deployment-assumptions)) | release checklist |

### 2.5 Rate limiting

| Control | Status | Where | Test |
|---|---|---|---|
| **Global ceiling: 300 requests / minute / IP on every `/api/v1` route** (Razorpay webhooks exempt: signature-verified) | ✅ (new) | `routes.ts` | `security.int.test.ts` "applies a global per-IP request limit" |
| OTP: per phone number (30 s cooldown, 5/hour, 10/day) and per IP, **in PostgreSQL**; 5 attempts per code | ✅ | `otp.service.ts` | `security.int.test.ts` rate-limit bypass |
| Refresh 60 / 15 min; admin login 10 / 15 min; admin 2FA steps 30 / 15 min (per IP) | ✅ | `middlewares/rate-limit.ts` | auth suites |
| Per-member limits (interests/day, reports/day, messages, uploads) keyed by user ID | ✅ | module services | module suites |
| `trust proxy` = loopback only, so a remote client can't spoof `X-Forwarded-For` | ✅ | `app.ts` | review |
| Nginx `limit_req` as the outer tier | 🟡 | Nginx | release checklist |

### 2.6 Input validation and API responses

| Control | Status | Where | Test |
|---|---|---|---|
| Every body, query and path parameter parsed with a strict shared zod schema (`parseInput`); unknown keys rejected (no mass assignment) | ✅ | `packages/shared/src/schemas/` | `security.int.test.ts` malicious input, mass assignment |
| JSON body limit 100 KB; malformed JSON → `400` | ✅ | `app.ts` | `security.int.test.ts` |
| Consistent envelope `{ success, message, data }` / `{ success: false, message, error: { code, details } }` | ✅ | `lib/response.ts`, `middlewares/error-handler.ts` | all suites |
| No stack traces, SQL or internal messages in error responses; unknown errors → generic `INTERNAL_ERROR` | ✅ | `error-handler.ts` | `security.int.test.ts` error hygiene |
| Public DTOs never contain phone numbers, date of birth, exact location or last-seen | ✅ | DTO mappers, `lib/pii-guards.ts` | `pii-guards.test.ts`, profile suites |

### 2.7 File uploads and Cloudinary

| Control | Status | Where | Test |
|---|---|---|---|
| Single file, size limit, JPEG/PNG/WebP only; filename never used | ✅ | `middlewares/upload.ts` | `security.int.test.ts` upload abuse |
| Every image decoded and **re-encoded** by sharp (EXIF/GPS stripped, polyglots destroyed), pixel limit against decompression bombs | ✅ | `lib/image.ts` | `image.test.ts`, `security.int.test.ts` |
| Cloudinary: server-side signed uploads only (no unsigned presets), random public IDs, `overwrite: false`, `https` URLs | ✅ | `providers/media/cloudinary.storage.ts` | review (tests use local storage) |
| Local media storage refused outside development | ✅ | env schema | `env-rules.test.ts` |
| Raw identity documents are not stored (no Aadhaar numbers, document images or KYC payloads); only status, provider reference and failure reason | ✅ | `providers/identity/`, `user_verifications` | review |

### 2.8 PostgreSQL and Sequelize

| Control | Status | Where | Test |
|---|---|---|---|
| All user values bound as replacements; raw SQL only interpolates server constants | ✅ | services | review, injection tests |
| Every schema change is a migration (up and down) | ✅ | `apps/api/src/migrations/` | migration round trip |
| Phone numbers stored as HMAC + AES-256-GCM ciphertext only | ✅ | `users` | `crypto.test.ts` |
| Sequelize query logging off; TLS option (`DATABASE_SSL`) | ✅ | `config/database.ts` | — |
| Least-privilege roles: DML-only API role, owner role for migrations (`DATABASE_MIGRATION_URL`) | 🟡 | deployment | release checklist |
| Append-only audit log (trigger rejects `UPDATE`/`DELETE`) | ✅ | `admin_audit_logs` | `admin-users.int.test.ts` |
| Destructive DB CLI commands only in development | ✅ | `scripts/db.ts` | review |

### 2.9 Socket.IO

| Control | Status | Where | Test |
|---|---|---|---|
| Handshake requires a member access token; the session is re-checked on every event | ✅ | `realtime/` | socket suite |
| `serveClient: false`, `maxHttpBufferSize`, per-event rate limits, room membership checked server-side | ✅ | `realtime/socket-server.ts` | socket suite |
| Blocks, suspensions and unmatches disconnect or refuse immediately | ✅ | `isBlockedEitherWay` + live session check per event | socket and safety suites |

### 2.10 Secrets, logging and audit

| Control | Status | Where | Test |
|---|---|---|---|
| No secrets in source code; all from environment variables validated at boot; `.env` ignored by git | ✅ | `packages/config/src/server/env.ts` | `env-rules.test.ts`, repository scan (§3) |
| Keys that must differ are enforced at boot (member/admin JWT secrets, phone/TOTP encryption keys, Razorpay secrets); live Razorpay keys only in production; `https` origins and `NODE_ENV=production` in production | ✅ | env schema | `env-rules.test.ts`, `razorpay.gateway.test.ts` |
| Logs redact `Authorization`, cookies, passwords, OTPs, codes, tokens, 2FA challenge tokens and secrets, phone numbers, sensitive query parameters (`q`, `phone`, `code`, `token`) | ✅ (extended) | `lib/logger.ts` | `security.int.test.ts` SEC-02 |
| **SQL text, bind values and constraint details are removed from logged database errors** | ✅ (new) | `lib/logger.ts` | `security.int.test.ts` "never logs SQL values or 2FA secrets" |
| Client IPs stored only as HMACs | ✅ | audit/OTP services | review |
| Admin audit log covers every admin write **and** sign-in, 2FA enrolment, lockout, logout and 2FA reset | ✅ (extended) | `modules/admin/audit/audit.service.ts` | `admin-auth.int.test.ts`, `security.int.test.ts` |
| Payment webhooks verified server-side (HMAC over the raw body), de-duplicated | ✅ | `modules/payments/` | payments suite |

## 3. Phase requirements

| Requirement | How it is met |
|---|---|
| No secrets in source code | Env-only secrets, boot-time validation, `.env` untracked, `.env.example` placeholders only. A scan of every tracked file for key patterns (Razorpay live keys, private keys, cloud credentials, quoted `secret`/`password` literals) found only one obviously fake test value (`rzp_live_Abc123Def`, used to test that live keys are refused). The development admin password in the dev seeder is deliberate and public: the seeder refuses to run outside development |
| No OTP logging | OTPs are never passed to the logger; `*.otp`/`*.code` redacted as a second line of defence; the dev SMS provider logs nothing |
| No sensitive information in error responses | Central error handler; generic `INTERNAL_ERROR`; tested |
| No phone numbers in public profiles | DTO mappers + PII guards; phone reveal is an audited super-admin action only |
| No exact user location exposed | Only city/area names (area only when the member opts in); no coordinates stored; EXIF/GPS stripped |
| No raw identity documents stored unnecessarily | No Aadhaar numbers or images stored; identity verification (when enabled) keeps only the provider's status and reference |
| Secure cookies | `HttpOnly; SameSite=Strict; Secure` (outside development), path-scoped |
| Strict CORS | Two exact origins, fixed methods and headers; Socket.IO web origin only |
| Request validation | Shared strict zod schemas on every input |
| Rate limiting | Global per-IP ceiling + per-endpoint, per-phone, per-code and per-member limits |
| Audit logging | Append-only admin audit log including authentication events |

## 4. Hardening findings (this phase)

| ID | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| **HARD-01** | **High** | Admin sign-in was password-only: one leaked password gave full access to member data and moderation. The security architecture requires mandatory TOTP. | Mandatory two-step sign-in with TOTP enrolment on first sign-in, encrypted secrets, hashed single-use challenges, replay protection, lockout across both factors, super-admin reset. Admin panel updated. Migration `20261003100000-add-admin-two-factor` | `admin-auth.int.test.ts` (12), `totp.test.ts` (8), `security.int.test.ts` |
| **HARD-02** | **High** | No global request limit: only a handful of endpoints were limited, so scraping and brute force against other routes were bounded only by Nginx (not yet deployed). `LIMITS.API_REQUESTS_PER_MINUTE` existed but was unused. | Per-IP limiter (300/min) on every `/api/v1` route except the signature-verified webhook | `security.int.test.ts` |
| **HARD-03** | **High** | `Cache-Control: no-store` was set only on some routes; responses with personal data (profiles, matches, chats, admin lists) could be stored by browsers or shared proxies. | `no-store` on every API response by default; public event/city lists keep their explicit short public cache | `security.int.test.ts` |
| **HARD-04** | **High** | Admin sign-in, lockout and logout weren't in the audit log, so account takeover attempts and insider sessions couldn't be reconstructed. | `admin.login`, `admin.totp_enrolled`, `admin.lockout`, `admin.logout`, `admin.two_factor_reset` audited in the same transaction | `admin-auth.int.test.ts` |
| **HARD-05** | Medium | CORS allowed every method and reflected any requested header for our origins. | Explicit methods, allowed and exposed headers, preflight cache 10 min | `security.int.test.ts` |
| **HARD-06** | Medium | Logged database errors contained the SQL with inlined values, bind parameters and unique-violation details (possible search terms or personal data). | Redaction of `sql`, `parameters`, `fields`, `errors`, `detail` on logged errors (also added 2FA fields) | `security.int.test.ts` |
| **HARD-07** | Low | HSTS used helmet's 180-day default; the referrer policy leaked no data but was not the strictest option. | HSTS 1 year with sub-domains; `Referrer-Policy: no-referrer` on API responses | `security.int.test.ts` |

No critical issues were found. All high issues are fixed and covered by tests. Earlier QA findings (SEC-01 … SEC-03) are in [security testing §4](../testing/security-testing.md#4-findings-and-fixes).

## 5. Before launch (open items)

- [ ] ⏳ Forced password change on an admin's first sign-in (accounts from `admin:create` keep the printed password until an admin-management screen exists). Until then: deliver passwords over a secure channel and treat the printed password as a one-time secret.
- [ ] 🟡 Nginx deployed as in [best practices §5](security-best-practices.md#5-nginx-and-deployment-assumptions): TLS, HSTS, CSP, admin API only on the admin host, `limit_req`, API bound to `127.0.0.1`.
- [ ] 🟡 Separate, CSPRNG-generated production secrets in a secret store (`JWT_*`, `PHONE_*`, `TOTP_ENCRYPTION_KEY`, `OTP_HMAC_SECRET`, Cloudinary, SMS, Razorpay).
- [ ] 🟡 Database roles: DML-only API role; migrations with the owner role; TLS to the database.
- [ ] ⏳ Real SMS provider (the dev provider is refused outside development).
- [ ] ⏳ Move in-memory rate limiters to a shared store (Redis) before running more than one API process.
- [ ] Every admin enrolled in two-factor sign-in before production data is loaded.

## 6. Residual risks

| Risk | Severity | Mitigation / plan |
|---|---|---|
| In-memory rate limiters reset on restart and aren't shared between processes | Low (single process) | OTP limits are DB-backed; Redis before scaling out; Nginx `limit_req` |
| Anyone knowing an admin email can lock the account for 15 minutes | Low | IP limits on every sign-in step; lock is audited; accepted over weaker lockout |
| TOTP secret shown as text (no QR code) | Low | Deliberate: no extra dependency. The secret is shown once per challenge over TLS, to the admin who just proved the password |
| PostgreSQL error messages can echo an invalid value (e.g. "invalid input syntax for type uuid") into logs | Low | Inputs are validated by zod before reaching SQL, so this needs a bug; SQL and parameters are redacted |
| `uuid` moderate advisory via Sequelize | Moderate | Not reachable (only `v4` used): see [security testing §5](../testing/security-testing.md#5-accepted-risks-and-follow-ups) |
| Identity verification is a signal, not a guarantee | Product | Never presented as a safety guarantee in copy ([community guidelines](../safety/community-guidelines.md)) |
