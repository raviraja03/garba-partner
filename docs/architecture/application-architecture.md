# Application Architecture — Garba Partner

> Related: [System architecture](system-architecture.md), [Database architecture](database-architecture.md), [Security architecture](security-architecture.md), [Coding standards](../development/coding-standards.md)

## Contents

1. [Monorepo structure](#1-monorepo-structure)
2. [packages/shared](#2-packagesshared)
3. [packages/config](#3-packagesconfig)
4. [API architecture](#4-api-architecture)
5. [API endpoint catalogue](#5-api-endpoint-catalogue)
6. [Realtime architecture (Socket.IO)](#6-realtime-architecture-socketio)
7. [Admin architecture](#7-admin-architecture)
8. [Web frontend architecture](#8-web-frontend-architecture)
9. [Business rules and limits](#9-business-rules-and-limits)

---

## 1. Monorepo structure

Tooling: **npm workspaces** (no extra monorepo tool in the MVP). Node.js **22.12+** (22 or 24 LTS; `engines` in the root `package.json`). TypeScript `strict`. All packages are ESM (`"type": "module"`).

```text
garba-partner/
├── apps/
│   ├── web/                     # @garba-partner/web   — member SPA
│   ├── admin/                   # @garba-partner/admin — admin SPA
│   └── api/                     # @garba-partner/api   — Express + Socket.IO + worker
├── packages/
│   ├── config/                  # @garba-partner/config — env schema, tsconfig/eslint/prettier/tailwind presets
│   └── shared/                  # @garba-partner/shared — types, enums, constants, zod schemas, error codes, socket contracts
├── docs/
├── .env                         # git-ignored
├── .env.example                 # committed, no secrets
├── .gitignore
├── package.json                 # workspaces + root scripts
├── tsconfig.json                # solution file with project references
└── README.md
```

**Dependency direction (enforced by ESLint `import/no-restricted-paths`):**

```text
apps/web ─┐
apps/admin├──► packages/shared ──► (no internal deps)
apps/api ─┘         ▲
     └──────► packages/config
```

- Apps never import from each other.
- `packages/shared` has **no runtime dependencies except `zod`**. It must be safe to bundle into the browser: no Node APIs, no secrets, no server-only logic.
- `packages/config` has a browser-safe entry (`@garba-partner/config/client`) and a Node-only entry (`@garba-partner/config/server`). The web/admin apps never import the server entry.

**Root scripts (`package.json`):**

| Script | Action |
|---|---|
| `dev` | Build shared/config in watch mode + run api, web and admin dev servers concurrently |
| `build` | `tsc -b` for packages, then build all apps |
| `typecheck` | `tsc -b --noEmit`-equivalent for all workspaces |
| `lint` / `lint:fix` | ESLint across the repo |
| `format` / `format:check` | Prettier |
| `test` | Vitest across workspaces |
| `db:migrate` / `db:migrate:down` / `db:seed` | Proxy to `apps/api` scripts |

**Build of shared packages:** `packages/shared` and `packages/config` compile with `tsc` (project references) to `dist/`, and `package.json#exports` points to `dist`. In dev, `tsc -b -w` keeps them up to date.

---

## 2. packages/shared

Shared code is the **single source of truth** for contracts between apps. Duplicating a type, enum or constant in an app is a review blocker.

```text
packages/shared/src/
├── constants/
│   ├── limits.ts          # LIMITS (see §9)
│   ├── enums.ts           # GENDERS, PARTNER_PREFERENCES, EXPERIENCE_LEVELS, DANCE_STYLES, USER_STATUSES, ...
│   ├── report.ts          # REPORT_REASONS, REPORT_PRIORITY_BY_REASON
│   └── admin.ts           # ADMIN_ROLES, ADMIN_PERMISSIONS, ROLE_PERMISSIONS
├── errors/
│   └── error-codes.ts     # ERROR_CODES + default user-facing messages
├── schemas/               # zod schemas for request bodies/queries (used by API validation AND frontend forms)
│   ├── auth.schema.ts
│   ├── profile.schema.ts
│   ├── event.schema.ts
│   ├── discovery.schema.ts
│   ├── interest.schema.ts
│   ├── message.schema.ts
│   ├── report.schema.ts
│   └── admin/*.schema.ts
├── types/
│   ├── api.ts             # ApiSuccess<T>, ApiError, PaginatedMeta
│   ├── dto/*.ts           # MeDto, PublicProfileDto, EventDto, InterestDto, MatchDto, MessageDto, NotificationDto, admin DTOs
│   └── socket.ts          # ClientToServerEvents, ServerToClientEvents, SocketData
├── utils/
│   ├── age.ts             # calculateAge(dob, now, tz='Asia/Kolkata')
│   └── contact-detection.ts # looksLikeContactInfo(text) — used by web nudge and API flagging
└── index.ts
```

Conventions:

- Enums are `as const` arrays plus derived union types, e.g. `export const GENDERS = ['woman', 'man', 'non_binary'] as const; export type Gender = (typeof GENDERS)[number];`. No TS `enum`.
- DTOs describe **API responses**, not DB rows. The API maps models to DTOs explicitly.
- Zod schemas export both the schema and the inferred type (`export type CreateProfileInput = z.infer<typeof createProfileSchema>`).

---

## 3. packages/config

```text
packages/config/
├── src/
│   ├── server/env.ts        # zod schema for all server env vars + loadServerEnv() (fails fast on invalid env)
│   ├── client/env.ts        # zod schema for VITE_* vars + loadClientEnv(import.meta.env)
│   └── index.ts
├── tsconfig/
│   ├── base.json            # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, ...
│   ├── node.json            # extends base; for apps/api
│   └── react.json           # extends base; jsx, DOM libs; for apps/web, apps/admin
├── eslint/index.js          # flat config shared by all workspaces
├── prettier/index.json
└── tailwind/theme.css       # Tailwind v4 @theme tokens (brand colours, fonts, radii) imported by web & admin
```

`loadServerEnv()` also enforces cross-field rules:

- `APP_ENV=production` ⇒ `SMS_PROVIDER !== 'mock'` and `TEST_OTP_PHONES` is empty.
- `JWT_ACCESS_SECRET !== JWT_ADMIN_ACCESS_SECRET`, and each secret is ≥ 32 bytes.
- Keys decode to exactly 32 bytes.

---

## 4. API architecture

### 4.1 Layers

```text
HTTP / Socket.IO
   │
   ▼
routes  ── declare path, middlewares (auth, role, rate limit, validate), controller
   │
   ▼
controllers ── thin: read validated input + req.auth, call ONE service method, send envelope
   │
   ▼
services ── business logic, authorization decisions, transactions, calls to other services/providers
   │
   ▼
models (sequelize-typescript) ── persistence; complex read queries live in <domain>.queries.ts
   │
   ▼
PostgreSQL
```

Rules:

- **Controllers never touch models.** Services never touch `req`/`res`.
- Socket handlers call the **same service methods** as REST controllers (e.g. `chatService.sendMessage`), so the rules are identical over both transports.
- Cross-domain calls go through the other domain's service (e.g. `interestsService` calls `safetyService.assertCanInteract`).
- Repository classes are **not** used by default. Complex or reused queries go in `<domain>.queries.ts` functions, as allowed by the CLAUDE.md rule "repositories only when they provide clear value".
- Providers (`SmsProvider`, `MediaStorage`) are interfaces in `src/providers/`, with implementations chosen from env at startup.

### 4.2 Folder structure

```text
apps/api/src/
├── server.ts                  # HTTP + Socket.IO bootstrap, graceful shutdown
├── worker.ts                  # scheduled jobs bootstrap
├── app.ts                     # express app factory (used by server.ts and tests)
├── config/
│   ├── env.ts                 # readEnv() → loadServerEnv() from @garba-partner/config
│   ├── database.ts            # Sequelize instance, model registration, pingDatabase()
│   └── umzug.ts               # migrator + seeder factories
├── migrations/                # 20260925100000-create-users.ts ... (raw SQL, transactional)
├── seeders/                   # development seeders (+ production-safe reference seeders later)
├── scripts/
│   └── db.ts                  # db CLI: migrate / undo / status / seed / reset
├── models/                    # one file per table (user.model.ts, user-profile.model.ts, ...)
├── modules/
│   ├── auth/                  # otp, sessions, tokens
│   │   ├── auth.routes.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── otp.service.ts
│   │   ├── token.service.ts
│   │   └── auth.test.ts
│   ├── users/                 # /me, account deletion
│   ├── profiles/              # profile CRUD, photos
│   ├── verification/          # photo verification requests
│   ├── locations/             # cities, areas (read)
│   ├── events/                # member event APIs, attendance
│   ├── discovery/             # discovery.queries.ts (eligibility SQL)
│   ├── interests/
│   ├── matches/
│   ├── chat/                  # messages service + socket handlers
│   ├── safety/                # blocks, reports, interaction gate, auto-hide
│   ├── notifications/
│   └── admin/                 # admin auth + admin sub-modules (users, reports, verifications, photos, events, cities, audit, admins)
├── realtime/
│   ├── socket-server.ts       # io instance, auth middleware, connection handler
│   └── emitter.ts             # typed helpers: emitToUser(userId, event, payload), disconnectUser(userId)
├── jobs/                      # one file per job (expire-interests.job.ts ...)
├── middlewares/
│   ├── request-id.ts
│   ├── require-user.ts        # member auth (JWT aud=app + session + status)
│   ├── require-member.ts      # onboarded + active
│   ├── require-admin.ts       # admin auth + permission check
│   ├── validate.ts            # zod validation of body/query/params
│   ├── rate-limit.ts          # named limiters
│   ├── upload.ts              # multer memory storage with limits
│   ├── host-guard.ts          # member vs admin host separation
│   ├── not-found.ts
│   └── error-handler.ts
├── providers/
│   ├── sms/{sms.provider.ts, msg91.sms.ts, twilio.sms.ts, mock.sms.ts}
│   └── media/{media.storage.ts, cloudinary.storage.ts}
├── lib/
│   ├── app-error.ts           # AppError(code, httpStatus, message?, details?)
│   ├── response.ts            # ok(res, data, message?, meta?), created(...)
│   ├── crypto.ts              # hmac, aes-gcm encrypt/decrypt, random tokens
│   ├── phone.ts               # E.164 normalisation, phone hash
│   ├── logger.ts              # pino with redaction
│   ├── pagination.ts          # cursor encode/decode
│   └── image.ts               # sharp validation + re-encode + EXIF strip
└── types/
    └── express.d.ts           # req.auth, req.admin typings
```

### 4.3 Request pipeline (order matters)

1. `request-id` → 2. `pino-http` logger (redacted) → 3. `helmet` → 4. `host-guard` → 5. `cors` (allow-list, credentials, dev only in practice) → 6. `express.json({ limit: '100kb' })` → 7. `cookie-parser` → 8. global `rate-limit` → 9. routers (`/api/v1`, `/api/v1/admin`) → 10. `not-found` → 11. `error-handler`.

Uploads skip the JSON parser and use `multer` (memory storage, `limits: { fileSize: 5 MB, files: 1 }`) on the specific route.

### 4.4 Response envelope

Success:

```json
{
  "success": true,
  "message": "Success",
  "data": { },
  "meta": { "nextCursor": "eyJ0IjoiMjAyNi0xMC0wMVQxMjowMDowMFoiLCJpZCI6Ii4uLiJ9" }
}
```

`meta` is only present on paginated responses.

Error:

```json
{
  "success": false,
  "message": "You have reached today's interest limit.",
  "error": {
    "code": "INTEREST_LIMIT_REACHED",
    "details": null
  }
}
```

- For validation errors, `details` is an array of `{ path: string, message: string }`.
- In production the error handler **never** returns stack traces, SQL, Sequelize error text or internal IDs. Unknown errors → `500 INTERNAL_ERROR` with a generic message. The full error is logged with the request ID.
- The `X-Request-Id` header is always returned, so support can correlate.

### 4.5 Error codes

Defined in `packages/shared/src/errors/error-codes.ts`.

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod validation failed |
| `UNAUTHENTICATED` | 401 | Missing/invalid/expired access token, revoked session |
| `REFRESH_INVALID` | 401 | Refresh token missing/invalid/reused |
| `FORBIDDEN` | 403 | Authenticated but not permitted (admin role, not onboarded) |
| `ACCOUNT_SUSPENDED` | 403 | Suspended member calling a social endpoint |
| `ACCOUNT_BANNED` | 403 | Banned member |
| `ONBOARDING_REQUIRED` | 403 | Member endpoint before onboarding is complete |
| `UNDERAGE` | 403 | DOB < 18 or DOB locked |
| `NOT_FOUND` | 404 | Resource absent **or** hidden by block/visibility rules |
| `USER_UNAVAILABLE` | 409 | Target user can't be interacted with (blocked, ineligible, suspended). Deliberately generic |
| `CONFLICT` | 409 | Uniqueness conflict (e.g. duplicate pending interest) |
| `MATCH_NOT_ACTIVE` | 409 | Chat action on an ended match |
| `EVENT_NOT_OPEN` | 409 | Attendance/discovery on a draft, cancelled or ended event |
| `OTP_INVALID` / `OTP_EXPIRED` / `OTP_ATTEMPTS_EXCEEDED` | 400 | OTP verification failures |
| `RATE_LIMITED` | 429 | Any rate limit (includes a `Retry-After` header) |
| `INTEREST_LIMIT_REACHED` | 429 | Daily interest cap |
| `VERIFICATION_LIMIT_REACHED` | 429 | Verification attempt cap |
| `PHOTO_LIMIT_REACHED` | 409 | More than 6 photos |
| `LAST_PHOTO` | 409 | Deleting the only photo while discovery is enabled |
| `INVALID_IMAGE` | 400 | Not a decodable JPEG/PNG/WebP, too small or too large |
| `ADMIN_TOTP_REQUIRED` / `ADMIN_TOTP_INVALID` / `ADMIN_LOCKED` | 401/423 | Admin login steps |
| `INTERNAL_ERROR` | 500 | Anything unexpected |

### 4.6 Validation

- Every route with input declares `validate({ body?, query?, params? })` using schemas from `@garba-partner/shared`. Controllers only read `req.validated` (typed), never raw `req.body`.
- Schemas are `.strict()`: unknown keys are rejected. This prevents mass assignment (e.g. a client sending `status: 'active'`).
- UUID params are validated as UUIDs before they reach the DB.

### 4.7 Pagination

- **Cursor-based** for all lists that grow (discovery, events, interests, matches, messages, notifications, admin lists).
- The cursor is an opaque base64url JSON of the sort key + id, e.g. `{ t: '2026-10-01T12:00:00Z', id: '…' }`. The server validates its shape. Invalid → `VALIDATION_ERROR`.
- `limit` defaults to 20 and is capped at 50 (messages: default 30, max 100).

### 4.8 Authentication middleware (members)

`requireUser`:

1. Read `Authorization: Bearer <jwt>`. Verify the HS256 signature with `JWT_ACCESS_SECRET`, `aud = 'app'`, `iss = 'garba-partner'`, and `exp`.
2. One query: `SELECT u.id, u.status, u.onboarding_completed_at, s.revoked_at FROM users u JOIN user_sessions s ON s.id = :sid AND s.user_id = u.id WHERE u.id = :sub`.
3. Reject if there's no row, the session is revoked, or `status ∈ {banned, deleted}`.
4. Attach `req.auth = { userId, sessionId, status, onboarded }`.

`requireMember` (used by all social routes): `status === 'active'` (else `ACCOUNT_SUSPENDED` or the like) **and** `onboarded` (else `ONBOARDING_REQUIRED`).

Checking the DB per request means suspensions and logouts take effect immediately rather than after up to 15 min. The query is a PK join and costs ~1 ms. If it ever becomes hot, it can be cached in-process for ≤ 30 s.

JWT claims: `{ sub: userId, sid: sessionId, aud: 'app', iss: 'garba-partner', iat, exp }`. No PII in tokens.

### 4.9 Transactions

A managed transaction (`sequelize.transaction(async (t) => …)`) is **required** for:

- OTP verify (consume OTP + find/create user + create session)
- Refresh rotation (revoke old + insert new)
- Interest send with mutual auto-match; interest accept (row lock `FOR UPDATE`)
- Block (insert block + cancel interests + end match)
- Report create with `alsoBlock` and auto-hide evaluation
- Sanction apply/revoke (sanction row + user status + session revocation)
- Account deletion request and purge
- Photo reorder/delete (position integrity, primary-photo change revoking verification)

Side effects outside the DB (Socket.IO emits, Cloudinary deletes) run **after commit** (`t.afterCommit(...)`).

### 4.10 File uploads

1. `multer` memory storage, max 5 MB, 1 file, field `photo`/`selfie`/`cover`.
2. `lib/image.ts` uses **sharp**: decode (rejects non-images and polyglots), check format ∈ {jpeg, png, webp}, check dimensions ≥ 400×400 and ≤ 8000×8000, auto-rotate from EXIF orientation, resize to max 1600 px on the long edge, **re-encode to JPEG/WebP without metadata** (sharp drops EXIF/GPS unless `withMetadata()` is called, and **we never call it**).
3. Upload the processed buffer to Cloudinary through `MediaStorage.upload({ folder, type })`:
   - Profile photos: `type: 'upload'`, folder `${prefix}/profile-photos/${userId}`, random public ID.
   - Verification selfies: `type: 'authenticated'` (private), folder `${prefix}/verification/${userId}`.
   - Event covers: `type: 'upload'`, folder `${prefix}/events`.
4. Only `public_id` (plus `width`/`height`) is stored in the DB. URLs are built on the client (public assets) or signed on the server (private assets).
5. Test requirement: a fixture JPEG containing GPS EXIF must produce a stored buffer with no EXIF.

---

## 5. API endpoint catalogue

Auth legend: **P** = public, **U** = `requireUser` (any non-banned status, onboarding not required), **M** = `requireMember` (active + onboarded), **A:perm** = admin with permission.

All paths are prefixed with `/api/v1`.

### 5.1 System & reference data

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | P | `{ status: 'ok', db: 'ok' }` |
| GET | `/cities` | P | Active cities |
| GET | `/cities/:cityId/areas` | P | Active areas of a city |
| GET | `/legal/versions` | P | Current terms/privacy/guidelines versions |

### 5.2 Auth

| Method | Path | Auth | Rate limit | Description |
|---|---|---|---|---|
| POST | `/auth/otp/request` | P | per phone hash + per IP (DB-backed) | `{ phone }` → `{ expiresInSec, resendAvailableInSec }` |
| POST | `/auth/otp/verify` | P | per IP | `{ phone, code }` → `{ accessToken, user: MeDto }` + refresh cookie |
| POST | `/auth/refresh` | cookie | per IP | Rotates the refresh token → `{ accessToken, user: MeDto }`. Requires the `X-Requested-With: gp-web` header |
| POST | `/auth/logout` | U | — | Revokes the current session, clears the cookie |
| POST | `/auth/logout-all` | U | — | Revokes all sessions of the user |

Example: `POST /api/v1/auth/otp/verify`

```json
// request
{ "phone": "+919812345678", "code": "482913" }
// 200 response (Set-Cookie: gp_rt=...; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=2592000)
{
  "success": true,
  "message": "Logged in",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "user": {
      "id": "7c2e0a4e-3b0f-4a55-9a53-0f1c1f2a9b10",
      "status": "active",
      "onboardingStatus": "incomplete",
      "photoVerified": false
    }
  }
}
```

### 5.3 Me, profile, photos, verification

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me` | U | `MeDto`: own full profile incl. DOB, preferences, settings, status, sanction info if suspended |
| POST | `/me/profile` | U | Create profile (onboarding). Body: dob, confirmsAdult, displayName, gender, cityId, areaId?, showArea, experience, styles, partnerGenderPreference, ageMin, ageMax, bio?, discoveryEnabled, acceptedTermsVersion |
| PATCH | `/me/profile` | M* | Update profile (no DOB). *Also allowed while onboarding is in progress |
| PATCH | `/me/settings` | U | `{ discoveryEnabled?, showArea? }` |
| POST | `/me/photos` | U | multipart `photo` → `PhotoDto` (rate limit 20/h) |
| DELETE | `/me/photos/:photoId` | U | Delete own photo |
| PUT | `/me/photos/order` | U | `{ photoIds: uuid[] }`: must be exactly the user's non-rejected photos |
| GET | `/me/verification` | U | Current verification state |
| POST | `/me/verification` | M | Start → `{ requestId, gesture: { code, instruction } }` |
| POST | `/me/verification/:requestId/selfie` | M | multipart `selfie` |
| DELETE | `/me` | U | Request account deletion. Body `{ confirm: "DELETE" }` |
| POST | `/me/restore` | U | Restore a `pending_deletion` account within the grace period |

Example: `PublicProfileDto` (what other members receive):

```json
{
  "id": "0b7c…",
  "displayName": "Priya",
  "age": 26,
  "gender": "woman",
  "city": { "id": "…", "name": "Pune" },
  "area": null,
  "bio": "Dancing since school — two-taali to dodhiyu.",
  "experience": "advanced",
  "styles": ["garba", "dandiya_raas"],
  "photos": [{ "id": "…", "publicId": "garba-partner/production/profile-photos/…/abc", "width": 1200, "height": 1600 }],
  "photoVerified": true,
  "context": { "sharedEventId": "…" }
}
```

### 5.4 Events

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/events` | P | Query: `cityId` (required), `from`, `to`, `cursor`, `limit`. Published, not ended. Counts only |
| GET | `/events/:idOrSlug` | P | Event detail. If authenticated, includes `myAttendance` |
| PUT | `/events/:eventId/attendance` | M | `{ status: 'going' \| 'interested', lookingForPartner: boolean }` |
| DELETE | `/events/:eventId/attendance` | M | Remove attendance (also removes it from event discovery) |
| GET | `/me/events` | M | Own attendances (upcoming + past) |

### 5.5 Discovery

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/discovery` | M | Query: `mode=event\|city`, `eventId` (event mode), `cityId` (city mode, defaults to own), `experience[]`, `styles[]`, `ageMin`, `ageMax`, `verifiedOnly`, `cursor`, `limit` → `PublicProfileDto[]`. Rate limit 60/min |
| GET | `/users/:userId/profile` | M | `PublicProfileDto`, gated by the interaction gate. `404` if blocked, ineligible or unknown |

### 5.6 Interests, matches, chat

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/interests` | M | `{ receiverId, eventId? }` → `{ interest, matched: boolean, match? }` |
| GET | `/interests/received` | M | Pending received (cursor) |
| GET | `/interests/sent` | M | Pending sent (cursor) |
| POST | `/interests/:interestId/accept` | M | Receiver only → `{ match }` |
| POST | `/interests/:interestId/decline` | M | Receiver only → `204`-style success |
| POST | `/interests/:interestId/withdraw` | M | Sender only |
| GET | `/matches` | M | Active matches with last message preview + unread flag (cursor by last activity) |
| GET | `/matches/:matchId` | M | Participant only |
| POST | `/matches/:matchId/unmatch` | M | Participant only |
| GET | `/matches/:matchId/messages` | M | Query: `before` cursor, `limit` (≤ 100). Participant only, active match only |
| POST | `/matches/:matchId/messages` | M | REST fallback `{ clientMessageId, body }` |
| POST | `/matches/:matchId/read` | M | `{ lastReadMessageId }` |

### 5.7 Safety & notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/blocks` | U** | `{ userId }` (**allowed for suspended users too, so they can still protect themselves) |
| GET | `/blocks` | U | Blocked members (id, displayName, primary photo) |
| DELETE | `/blocks/:userId` | U | Unblock |
| POST | `/reports` | U** | `{ reportedUserId, messageId?, reason, details?, alsoBlock }` |
| GET | `/notifications` | U | Cursor list |
| GET | `/notifications/unread-count` | U | `{ count }` |
| POST | `/notifications/read` | U | `{ ids?: uuid[], all?: true }` |

### 5.8 Admin API (`/api/v1/admin`)

| Method | Path | Permission |
|---|---|---|
| POST | `/admin/auth/login` | P (rate limited) → `{ challengeId, requiresSetup }` |
| POST | `/admin/auth/totp` | challenge → access token + admin refresh cookie |
| POST | `/admin/auth/setup` | challenge (first login): new password + TOTP enrolment confirm |
| POST | `/admin/auth/refresh`, `/admin/auth/logout` | cookie / admin |
| GET | `/admin/me` | any admin |
| GET | `/admin/dashboard` | `dashboard:view` |
| GET | `/admin/users`, `/admin/users/:id` | `users:view` |
| POST | `/admin/users/:id/sanctions` | `users:sanction` — `{ type: 'warning'\|'suspension'\|'ban', durationDays?, reason, reportId? }` |
| POST | `/admin/sanctions/:id/revoke` | `users:sanction` — `{ reason }` |
| POST | `/admin/users/:id/clear-auto-hide` | `users:sanction` |
| POST | `/admin/users/:id/reveal-phone` | `users:reveal_phone` — `{ reason }` |
| GET | `/admin/reports`, `/admin/reports/:id` | `reports:manage` |
| POST | `/admin/reports/:id/assign` | `reports:manage` |
| POST | `/admin/reports/:id/resolve` | `reports:manage` — `{ action, note, sanction?, photoIds?, clearAutoHide? }` |
| GET | `/admin/verifications`, `/admin/verifications/:id` | `verifications:review` (detail returns a 5-min signed selfie URL) |
| POST | `/admin/verifications/:id/approve` / `reject` | `verifications:review` |
| GET | `/admin/photos` | `photos:review` |
| POST | `/admin/photos/:id/approve` / `reject` | `photos:review` |
| GET/POST | `/admin/events` | `events:view` / `events:manage` |
| GET/PATCH | `/admin/events/:id` | `events:view` / `events:manage` |
| POST | `/admin/events/:id/cover` | `events:manage` (multipart) |
| POST | `/admin/events/:id/publish` / `cancel` | `events:manage` |
| GET/POST/PATCH | `/admin/cities`, `/admin/cities/:id`, `/admin/cities/:id/areas`, `/admin/areas/:id` | `locations:manage` |
| GET | `/admin/audit-logs` | `audit:view` |
| GET/POST/PATCH | `/admin/admins`, `/admin/admins/:id` | `admins:manage` |
| POST | `/admin/admins/:id/reset-totp` | `admins:manage` |

Every admin write handler calls `auditService.log({ adminId, action, targetType, targetId, metadata, ip })` **inside the same transaction** as the change.

---

## 6. Realtime architecture (Socket.IO)

### 6.1 Connection

- Default namespace `/`, path `/socket.io`. Transports: WebSocket first, with long-polling fallback.
- Client: `io({ auth: (cb) => cb({ token: getAccessToken() }) })`. The function form means every reconnect uses the latest token.
- **Server auth middleware** (`io.use`): verifies the JWT and session exactly like `requireUser`, then requires `status = 'active'` and onboarding complete. Sets `socket.data = { userId, sessionId, tokenExp }` and joins room `user:{userId}`.
- **Token expiry:** a per-socket timer disconnects at `tokenExp` with the reason `token_expired`. The client refreshes over HTTP, then reconnects.
- Socket.IO `cors` is limited to `WEB_ORIGIN`. `maxHttpBufferSize: 16 KB`.
- Admins don't use sockets in the MVP (admin queues refresh by polling every 30 s).

### 6.2 Event contract (typed in `packages/shared/src/types/socket.ts`)

**Client → server** (all use acknowledgements `(payload, ack) => ack({ ok: true, data } | { ok: false, error: { code, message } })`):

| Event | Payload | Behaviour |
|---|---|---|
| `message:send` | `{ matchId, clientMessageId, body }` | `chatService.sendMessage()`. Ack returns the persisted `MessageDto` |
| `message:read` | `{ matchId, lastReadMessageId }` | `chatService.markRead()` |

**Server → client:**

| Event | Payload | Sent to |
|---|---|---|
| `message:new` | `MessageDto` | Both participants' `user:` rooms (sender's other tabs included) |
| `message:read` | `{ matchId, userId, lastReadAt }` | Other participant |
| `interest:new` | `InterestDto` | Receiver |
| `match:new` | `MatchDto` | Both users |
| `match:ended` | `{ matchId }` | Both users (unmatch, block, sanction, deletion). No reason given |
| `notification:new` | `NotificationDto` | Target user |
| `account:status` | `{ status }` | User, just before a forced disconnect on sanction |

### 6.3 Enforcement

- Every client → server handler: validate the payload with the shared Zod schema → per-user rate limit → call the service. The service re-checks match status, participant membership, blocks and both users' statuses on **every** message.
- **Sanctions, logout-all and deletion** call `disconnectUser(userId)`, which runs `io.in('user:' + userId).disconnectSockets(true)`.
- **Blocks/unmatch** emit `match:ended`. Subsequent sends fail server-side regardless of client state.
- Emits happen in `afterCommit` hooks only, so clients never see uncommitted state.

### 6.4 Scaling note

The MVP runs a single API process. For multiple processes, add `@socket.io/redis-adapter` and sticky sessions. Because all emits go to `user:{id}` rooms via `realtime/emitter.ts`, no business code changes ([system architecture §8.3](system-architecture.md#83-scaling-path-build-only-when-metrics-show-the-need)).

---

## 7. Admin architecture

### 7.1 Admin app (`apps/admin`)

- Same stack and conventions as the web app (§8), desktop-first layout (sidebar + content). Tables use server-side cursor pagination.
- Routes: `/login`, `/login/totp`, `/setup`, `/dashboard`, `/reports`, `/reports/:id`, `/verifications`, `/verifications/:id`, `/photos`, `/users`, `/users/:id`, `/events`, `/events/new`, `/events/:id`, `/cities`, `/audit-logs`, `/admins`.
- The navigation shows only the items the admin's role permits (`ROLE_PERMISSIONS` from shared). This is **UX only**. The server enforces permissions.
- Sensitive views: the selfie viewer loads signed URLs on demand (never cached, no download button). Phone reveal is a modal that requires a reason and shows the number once. It isn't kept in any query cache.
- The session idle timeout of 30 min is enforced server-side (the refresh is rejected if the session `last_used_at` is more than 30 min ago), and the client shows a warning at 25 min.

### 7.2 Admin API

- Mounted at `/api/v1/admin`, and accepted only on the admin host (`host-guard`).
- `requireAdmin(permission)`: verifies the JWT with `JWT_ADMIN_ACCESS_SECRET` and `aud = 'admin'`, loads `admin_users` + `admin_sessions`, checks the admin is `active`, then checks `ROLE_PERMISSIONS[role].includes(permission)`.
- Admin refresh cookie: `gp_admin_rt`, `Path=/api/v1/admin/auth`, 12 h absolute, rotating.
- Member tokens can never authorise admin routes (different secret and audience), and the reverse holds too.

### 7.3 Admin role permission matrix

| Permission | `super_admin` | `moderator` | `event_manager` |
|---|:-:|:-:|:-:|
| `dashboard:view` | ✅ | ✅ | ✅ |
| `users:view` | ✅ | ✅ | ❌ |
| `users:sanction` (warn/suspend/ban/revoke/clear auto-hide) | ✅ | ✅ | ❌ |
| `users:reveal_phone` | ✅ | ❌ | ❌ |
| `reports:manage` | ✅ | ✅ | ❌ |
| `verifications:review` | ✅ | ✅ | ❌ |
| `photos:review` | ✅ | ✅ | ❌ |
| `events:view` | ✅ | ✅ | ✅ |
| `events:manage` | ✅ | ❌ | ✅ |
| `locations:manage` | ✅ | ❌ | ✅ |
| `audit:view` | ✅ | ❌ | ❌ |
| `admins:manage` | ✅ | ❌ | ❌ |

A moderator can't sanction themselves or other admins (admins aren't member accounts). A super admin can't delete the last active super admin.

---

## 8. Web frontend architecture

### 8.1 Stack

| Concern | Choice | Reason |
|---|---|---|
| Build | Vite + React 19 + TS strict | Mandated |
| Styling | Tailwind CSS v4, theme tokens from `@garba-partner/config/tailwind/theme.css` | Mandated. Shared tokens with admin |
| Routing | React Router (library/data mode) | Standard, supports lazy routes |
| Server state | TanStack Query | Caching, pagination, retries, cache updates from socket events |
| Forms | react-hook-form + `@hookform/resolvers/zod` with **shared schemas** | Same validation on client and server |
| Realtime | `socket.io-client` | Mandated |
| HTTP | Thin `fetch` wrapper (`lib/api-client.ts`) | No axios needed |
| Global client state | React context (auth/session only) | No Redux/Zustand in the MVP |

### 8.2 Folder structure

```text
apps/web/src/
├── main.tsx
├── app/
│   ├── App.tsx
│   ├── router.tsx               # lazy route definitions
│   ├── providers.tsx            # QueryClientProvider, AuthProvider, SocketProvider
│   └── guards/                  # RequireAuth, RequireOnboarded, PublicOnly, StatusGate (suspended/banned/pending_deletion screens)
├── pages/                       # route components — composition only
│   ├── landing/ login/ onboarding/ events/ event-detail/ discover/ interests/ chats/ chat/ profile/ settings/ safety/ legal/
├── features/
│   ├── auth/        (api.ts, hooks.ts, components/)
│   ├── profile/     (profile form, photo manager, verification)
│   ├── events/
│   ├── discovery/
│   ├── interests/
│   ├── matches/
│   ├── chat/        (useChatMessages, MessageList, Composer, ContactNudge)
│   ├── safety/      (BlockButton, ReportDialog, SafetyCard)
│   └── notifications/
├── components/
│   ├── ui/                      # Button, Input, Select, Sheet, Dialog, Toast, Avatar, Badge, Spinner, EmptyState
│   └── layout/                  # AppShell, BottomNav, TopBar
├── lib/
│   ├── api-client.ts            # base URL, bearer token, envelope unwrap, single-flight refresh on 401, ApiError
│   ├── auth-token.ts            # in-memory access token holder
│   ├── socket.ts                # socket singleton, connect/disconnect with auth lifecycle
│   ├── query-client.ts
│   ├── cloudinary.ts            # buildImageUrl(publicId, { w, h, crop: 'fill', gravity: 'face' }) + f_auto,q_auto
│   └── format.ts                # IST date formatting
└── styles/index.css             # @import tailwind + theme
```

### 8.3 Key patterns

- **Auth bootstrap:** `AuthProvider` calls `/auth/refresh` on mount. The in-memory token lives only in memory. The access token **never** goes into `localStorage`/`sessionStorage`. `api-client` uses a single-flight refresh: concurrent 401s share one refresh call.
- **Guards:** `RequireAuth` → `StatusGate` (suspended/banned/pending-deletion screens) → `RequireOnboarded` → page.
- **Query keys:** `['me']`, `['events', cityId, filters]`, `['event', id]`, `['discovery', mode, params]`, `['interests', 'received' | 'sent']`, `['matches']`, `['messages', matchId]`, `['notifications']`.
- **Socket → cache:** `message:new` → append to the `['messages', matchId]` infinite query and bump `['matches']`. `match:new` / `match:ended` → invalidate `['matches']` and, on ended, navigate away from that chat. `interest:new` → invalidate received interests + notification count.
- **Optimistic chat:** a message renders immediately with status `sending`, keyed by `clientMessageId`. The ack replaces it with the server message. On failure it shows `failed` with Retry (same `clientMessageId`).
- **Contact-sharing nudge:** `looksLikeContactInfo()` from shared runs before send and shows a confirm sheet (non-blocking).
- **Errors:** route-level error boundaries. API errors are mapped by `error.code` to friendly copy (shared default messages). Validation `details` are mapped onto form fields.
- **Images:** always rendered through `buildImageUrl` with explicit sizes, `loading="lazy"` and `alt` text ("Photo of Priya").
- **Security:** never `dangerouslySetInnerHTML` (ESLint rule). Chat text is rendered as text, and links are **not** auto-linked in the MVP. No PII in `console.*` or storage. The CSP forbids inline scripts.
- **Performance:** routes are lazy-loaded. Target an initial JS bundle < 200 KB gzip. Images are sized per viewport.
- **Mobile-first:** designed at 360 px width first. Bottom navigation. Touch targets ≥ 44 px.

---

## 9. Business rules and limits

Defined once in `packages/shared/src/constants/limits.ts` and imported everywhere. Changing a value is a reviewed change.

| Constant | Value | Used in |
|---|---|---|
| `MIN_AGE` | 18 | Onboarding |
| `PREF_AGE_MIN` / `PREF_AGE_MAX` | 18 / 80 | Preferences |
| `OTP_LENGTH` | 6 | Auth |
| `OTP_TTL_SECONDS` | 300 | Auth |
| `OTP_MAX_ATTEMPTS` | 5 | Auth |
| `OTP_RESEND_COOLDOWN_SECONDS` | 30 | Auth |
| `OTP_MAX_PER_PHONE_PER_HOUR` / `_PER_DAY` | 5 / 10 | Auth |
| `OTP_MAX_PER_IP_PER_HOUR` | 20 | Auth |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | Auth (env default) |
| `REFRESH_TOKEN_TTL_DAYS` | 30 | Auth (env default) |
| `DISPLAY_NAME_MIN` / `_MAX` | 2 / 30 | Profile |
| `BIO_MAX_LENGTH` | 300 | Profile |
| `PHOTOS_MIN` / `PHOTOS_MAX` | 1 / 6 | Photos |
| `PHOTO_MAX_BYTES` | 5 242 880 | Uploads |
| `PHOTO_MIN_DIMENSION` | 400 | Uploads |
| `VERIFICATION_ATTEMPTS_PER_DAY` | 3 | Verification |
| `VERIFICATION_SELFIE_RETENTION_DAYS` | 30 | Worker |
| `INTERESTS_PER_DAY` | 25 | Interests |
| `INTEREST_EXPIRY_DAYS` | 14 | Interests |
| `INTEREST_DECLINE_COOLDOWN_DAYS` | 30 | Discovery / interests |
| `MESSAGE_MAX_LENGTH` | 1000 | Chat |
| `MESSAGES_PER_MINUTE` | 30 | Chat |
| `ENDED_MATCH_MESSAGE_RETENTION_DAYS` | 90 | Worker |
| `REPORTS_PER_DAY` | 10 | Reports |
| `REPORT_DETAILS_MAX_LENGTH` | 1000 | Reports |
| `REPORT_CONTEXT_MESSAGES` | 10 | Reports |
| `AUTO_HIDE_REPORT_THRESHOLD` / `AUTO_HIDE_WINDOW_DAYS` | 3 / 7 | Safety |
| `ACCOUNT_DELETION_GRACE_DAYS` | 30 | Account |
| `DISCOVERY_PAGE_SIZE` | 20 | Discovery |
| `SUSPENSION_DURATIONS_DAYS` | [1, 3, 7, 30] | Admin |
