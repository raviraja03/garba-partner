# Testing Strategy

> Related: [Test cases](test-cases.md), [Security testing](security-testing.md), [Release checklist](release-checklist.md), [Database setup](../database/database-setup.md)

## 1. Purpose

How Garba Partner is tested: what each layer proves, where the tests live, how to run them, and what a change must add before it can merge. The platform handles adults meeting strangers, payments and personal data, so **security and safety rules are tested as behaviour, not just reviewed.**

## 2. Test layers

| Layer | Tool | Scope | Where |
|---|---|---|---|
| **Static checks** | TypeScript (strict), ESLint (type-aware, jsx-a11y), Prettier | Every package | `npm run typecheck`, `npm run lint`, `npm run format:check` |
| **Unit tests** | Vitest | Pure logic: schemas, text/contact/money detection, ranking, signatures, env rules, crypto, image processing | `packages/shared/test/*.test.ts`, `apps/api/src/**/*.test.ts` |
| **API integration tests** | Vitest + Supertest against a **real PostgreSQL** database | Every endpoint through the full Express stack: validation, auth, permissions, DB constraints, transactions | `apps/api/src/**/*.int.test.ts` |
| **Realtime tests** | Real Socket.IO client ↔ server | Handshake auth, live delivery, per-event checks, disconnects | `apps/api/src/realtime/socket.int.test.ts` |
| **External service doubles** | Injected fakes: dev SMS, fake media storage, **in-memory Razorpay** behind an injected `fetch` | Payments, uploads and OTP without network or credentials | `apps/api/src/test/` |
| **Security suite** | Vitest + Supertest | Cross-cutting attacks: unauthorized access sweep, JWT forgery, privilege escalation, IDOR, injection, uploads, CSRF, rate limits, error hygiene | `apps/api/src/security/security.int.test.ts` |
| **Builds** | Vite, `tsc -b` | Web and admin bundles, packages | `npm run build` |
| **End-to-end smoke** | Node scripts against the running dev stack (Vite proxy → API → DB) | Critical journeys per phase | Run by the release engineer ([release checklist §3](release-checklist.md#3-staging-verification)) |
| **Manual exploratory** | Browser (mobile width + desktop) | UX, accessibility, copy, payments in Razorpay Test Mode | [Test cases](test-cases.md) marked *manual* |

### Why integration-heavy

Most of the risk is in rules that span the HTTP layer, the database and permissions: blocks hiding people everywhere, exactly one match per pair, a booking only after a captured payment, sections hidden by role. These are tested **through the API against PostgreSQL**, with its real constraints, triggers and locks, not against mocks. Unit tests cover the pure helpers underneath.

## 3. Test data and isolation

- **Separate database:** `TEST_DATABASE_URL` must differ from `DATABASE_URL` (enforced by the env schema). `globalSetup` migrates it once; `useTestDatabase()` truncates every table before each test.
- **Fixtures create data through the API** (`createMember`, `createMatchedPair`, `createEvent`, `publishEvent`), so tests exercise the same validation users hit.
- **Unique IPs per member** (`uniqueIp()`) keep per-IP rate limits from coupling tests; rate-limit tests deliberately reuse or rotate IPs.
- **Time:** jobs take a `now` parameter (`expireSanctions`, `createEventReminders`, `expireOrders`, `purgeOldNotifications`), so time-based behaviour is tested without sleeping or mocking clocks.
- **No real secrets or services:** test env secrets are fixed strings; Razorpay, SMS and Cloudinary are replaced by doubles.

## 4. How to run

```bash
# Everything CI runs (format, lint, typecheck, unit + integration tests, builds):
TEST_DATABASE_URL=postgres://…/garba_partner_test npm run check

# One area while developing:
cd apps/api && npx vitest run src/modules/payments
cd packages/shared && npx vitest run test/safety.test.ts
```

Without `TEST_DATABASE_URL`, integration suites are **skipped** (not passed); CI must always set it. See [database setup](../database/database-setup.md).

## 5. Coverage by area

| Area | Main suites | Test count (approx.) |
|---|---|---|
| Authentication (OTP, sessions, refresh, CSRF, tokens) | `auth.int.test.ts`, `token.service.test.ts`, `admin-auth.int.test.ts`, `app.test.ts` | 47 |
| Profile & verification flags | `profile.int.test.ts`, `shared/profile.test.ts`, `image.test.ts`, `pii-guards.test.ts` | 51 |
| Events & attendance | `events.int.test.ts`, `admin-events.int.test.ts`, `admin-organizers.int.test.ts`, `attendance.int.test.ts`, `shared/event.test.ts` | 53 |
| Discovery | `discovery.int.test.ts`, `matching.test.ts`, `shared/discovery.test.ts` | 25 |
| Interests & matches | `interests.int.test.ts`, `constraints.int.test.ts`, `admin-matches.int.test.ts`, `shared/interest.test.ts` | 29 |
| Chat | `chat.int.test.ts`, `socket.int.test.ts`, `shared/chat.test.ts` | 34 |
| Block, report, moderation | `safety.int.test.ts`, `moderation.int.test.ts`, `admin-reports.int.test.ts`, `admin-users.int.test.ts`, `shared/safety.test.ts` | 57 |
| Notifications | `notifications.int.test.ts`, `shared/notification.test.ts` | 21 |
| Payments | `payments.int.test.ts`, `razorpay.gateway.test.ts`, `shared/payment.test.ts` | 40 |
| Admin permissions & dashboard | `authorize.test.ts`, `admin-dashboard.int.test.ts`, security matrix, `shared/dashboard.test.ts` | 25+ |
| Security (cross-cutting) | `security.int.test.ts` | 17 |
| Data model constraints | `models.int.test.ts` | 18 |

Totals at the QA phase: **shared 187**, **API 377** (30 files). Current numbers come from `npm run check`.

## 6. Rules for new code

1. Every endpoint gets integration tests for: success, validation (`400`), unauthenticated (`401`), wrong role/permission (`403`), someone else's resource (`404`), and the rate limit if it has one.
2. Every new protected endpoint is added to `MEMBER_ENDPOINTS` / `ADMIN_ENDPOINTS` in `security.int.test.ts` (the unauthorized-access sweep).
3. Business invariants that the database enforces (unique indexes, CHECKs, triggers) get a test that proves the constraint, not just the service check.
4. Anything that touches money, sanctions, blocks or visibility gets a negative test ("must not happen") as well as a positive one.
5. A bug fix starts with a failing regression test (see the QA findings in [security testing §4](security-testing.md#4-findings-and-fixes)).
6. Never claim a flow was tested if it wasn't: flows that need real providers (Razorpay live/test keys, SMS, Cloudinary) are marked **manual** in [test cases](test-cases.md).

## 7. QA run record (2026-09-30)

| Check | Result |
|---|---|
| `npm run check` | ✅ format, lint, typecheck; shared **187** tests; API **377** tests in 30 files; web and admin builds |
| Security suite | ✅ 17 tests; 3 findings fixed ([security testing §4](security-testing.md#4-findings-and-fixes)) |
| End-to-end regression through the dev stack (fresh seeded database) | ✅ events 35, discovery 26, interests 26, chat 28 (incl. live Socket.IO via the Vite proxy), safety & moderation 35, notifications 21, payments (disabled mode) 14, dashboard 11 = **196 checks** |
| `npm audit --omit=dev` | 3 moderate (accepted, see [security testing §5](security-testing.md#5-accepted-risks-and-follow-ups)); no high/critical |
| Razorpay Test Mode purchase | ⏳ Not run (no test keys in this environment): release checklist item |

Observations from the run: two end-to-end scripts written in earlier phases had to be updated for later product changes (retired report reason `scam_spam`; the added `booking` notification type), and back-to-back scripts from one IP correctly hit the OTP and admin-login rate limits. Neither is an application defect.

## 8. Known gaps

| Gap | Mitigation | Plan |
|---|---|---|
| No automated browser (UI) tests for web/admin | Typecheck + lint (incl. jsx-a11y) + manual test cases; API tests cover every rule the UI relies on | Add Playwright smoke tests for sign-in, discovery, chat, checkout before scale-up |
| Razorpay tested against a faithful mock, not the real API | Mock exercises the real adapter (auth, bodies, signatures); manual Test Mode run in the release checklist | Periodic Test Mode run in staging |
| Photo/identity verification review flow not implemented | Phone OTP and verified-flag rules are tested; no review queue to test | Verification phase |
| Load/performance testing | Indexes reviewed per phase | Hardening phase (k6 against staging) |
| In-memory rate limits (single process) | Tested per process | Redis store before horizontal scaling |
