# Security Testing

> Related: [Testing strategy](testing-strategy.md), [Test cases](test-cases.md), [Release checklist](release-checklist.md), [Security architecture](../architecture/security-architecture.md)

## 1. Purpose and scope

This page records the security QA of the monorepo (web, admin, api): what was tested, how, what was found, and what was fixed. It covers the OWASP Top 10 areas relevant to this app and its product-specific risks: exposing members, bypassing blocks and sanctions, and money.

**Method:**

1. Code review of authentication, authorization, every raw SQL statement, upload handling, logging, cookies, CORS/CSRF and the frontends' use of tokens and HTML.
2. An automated attack suite, `apps/api/src/security/security.int.test.ts`, run against the real API and PostgreSQL.
3. The existing per-module suites (which already contain most negative tests).
4. Regression end-to-end runs through the dev stack (Vite proxy → API → DB).
5. `npm audit --omit=dev` for production dependencies.

## 2. Results by category

| Category | How it was tested | Result |
|---|---|---|
| **Unauthorized access** | Sweep of **46 member endpoints** and **22 admin endpoints**: no token, a garbage token, and the other audience's token (admin↔member) | All `401` ✅ |
| **Invalid JWT** | Forged with a wrong secret; expired; wrong audience; `alg: none` unsigned; payload tampered (signature reused); valid signature but another member's session ID | All `401` ✅ (`algorithms: ['HS256']`, issuer/audience pinned, session ↔ subject checked in DB) |
| **Expired / revoked session** | Logout, DB session expiry, ban (`403 ACCOUNT_BANNED`), suspension, admin idle timeout (existing admin-auth tests) | Access ends on the next request ✅ (sessions are re-checked on every request and socket event) |
| **Privilege escalation** | Role × permission matrix (super admin / moderator / event manager) over 11 representative admin actions; member mass assignment (`status`, `photoVerifiedAt`, `role`, `hiddenFromDiscovery`) | Server-enforced `403`; strict schemas `400` ✅ |
| **IDOR** | A stranger calling matches, chats, messages, read receipts, notifications and message reports with real IDs of another pair; plus module suites (orders, bookings, warnings, interests, reports) | `404` everywhere (indistinguishable from missing) ✅. **Finding SEC-01** on public profiles, fixed |
| **Rate-limit bypass** | OTP sends from rotating IPs for one number; phone formatting variants; OTP guessing from rotating IPs; per-member limits keyed by user ID | Limits are per phone / per code in the DB, not only per IP ✅. `trust proxy` = loopback only, so a spoofed `X-Forwarded-For` from a remote client is ignored |
| **Malicious input** | SQL injection strings in search, filters, sort and path params; `__proto__` pollution; repeated/nested query keys; malformed JSON; oversized body (200 KB) | Parameterised SQL everywhere (only server constants are interpolated); `400`/`413`, never `5xx`; no prototype pollution ✅ |
| **SQL injection (review)** | Every `sequelize.query` with `${…}` reviewed: only constants (column names, SQL fragments, enum units) are interpolated; all user values use `:replacements` | ✅ |
| **XSS** | `<script>`/`onerror` payloads in chat and bio stored and returned as JSON text; React renders text (no `dangerouslySetInnerHTML` anywhere); `javascript:`/`data:` URLs rejected (`https://` only); `X-Content-Type-Options: nosniff` | ✅ |
| **File upload abuse** | HTML disguised as JPEG, SVG with script (as SVG and as PNG), image + appended PHP with path-traversal filename, 11 MB file, **decompression bomb** (20,000 × 20,000 PNG), two files, wrong field | Decoded and re-encoded by sharp (EXIF stripped), pixel limit, size limit (`413`), single part; filenames never used ✅ |
| **CSRF** | Refresh without the CSRF header, with the other app's header value, with a foreign `Origin`; cookie flags; CORS preflight from a foreign origin | `403` / no CORS grant; cookies `HttpOnly`, `SameSite=Strict`, `Secure` outside development ✅. Bearer-token endpoints aren't CSRF-able |
| **Error hygiene & headers** | 404/400 bodies; security headers | No stack traces or SQL in responses; `helmet` headers (HSTS, nosniff, frame options), no `X-Powered-By` ✅ |
| **Secrets & logging** | Log output captured during an admin phone search; redaction config review | **Finding SEC-02**, fixed |
| **Payments** | Existing suite: client amounts refused, forged checkout/webhook signatures, tampered webhook bodies, replays, duplicate/late payments, refund double-spend | ✅ ([webhook](../payments/webhook.md)) |
| **Realtime** | Existing socket suite: handshake auth, per-event session checks, payload/rate limits, non-member access | ✅ |
| **Dependencies** | `npm audit --omit=dev` | 3 moderate (see §5), no high/critical |

## 3. Tools and attack data

- The attacks are real HTTP requests through Supertest; forged JWTs are built with `jose` using the test secrets. Oversized, bomb and polyglot uploads are generated with `sharp`.
- Injection payloads: `' OR 1=1 --`, `'; DROP TABLE users; --`, `1) UNION SELECT phone_encrypted FROM users --`, URL-encoded variants and NUL bytes.
- Rate-limit tests rotate `X-Forwarded-For` (trusted only from loopback, as behind the local Nginx).

## 4. Findings and fixes

| ID | Severity | Finding | Fix | Regression test |
|---|---|---|---|---|
| **SEC-01** | **High** (privacy / IDOR-like) | `GET /api/v1/users/:userId/profile` returned any active member's profile to any member who had the ID. It ignored discovery visibility: members who paused discovery or never opted in, members auto-hidden pending moderation, and members in a report relationship stayed viewable. | The endpoint now applies discovery visibility. A profile is shown only if the target is discoverable (opted in, not hidden) **or** the two are connected (active match or pending interest). A report in either direction always hides it; blocks already did. `profile.service.ts` | `security.int.test.ts` "SEC-01", `profile.int.test.ts` "hides members who have not opted into discovery" |
| **SEC-02** | **High** (privacy: phone numbers in logs) | `pino-http` logged the full request URL and query. Admins search members **by phone number** (`/admin/users?q=98…`), so phone numbers were written to the API logs, against the rule "never expose phone numbers". | A request serializer redacts `q`, `phone`, `code` and `token` in the logged URL (`redactUrl`), and `req.query.*` for the same keys is added to pino's redaction paths. `lib/logger.ts`, `app.ts` | `security.int.test.ts` "SEC-02" (captures real log output) |
| **SEC-03** | Medium (data safety) | The DB CLI allowed destructive commands (`reset`, `migrate:undo:all`, `seed`, `seed:undo`) on **staging**; only production was blocked. The dev seeders themselves already refused non-development environments. | These commands now require `APP_ENV=development`. `scripts/db.ts` | Reviewed; the CLI runs `main()` on import (no unit seam). Staging can't boot yet anyway, since no real SMS provider exists |
| **QA-04** | Medium (test reliability) | Integration tests used Vitest's 5 s default timeout; member creation (OTP, Argon2, image processing) made some tests time out under load (seen on discovery and upload tests). | `testTimeout: 20 s`, `hookTimeout: 30 s` in `apps/api/vitest.config.ts` | Full suite |

No critical findings. All high findings are fixed and covered by regression tests.

The later **security hardening** phase found and fixed four more high issues (no admin 2FA, which was later removed again on request; no global rate limit; cacheable personal responses, admin sign-in missing from the audit log) and three medium/low ones. They are listed in [security checklist §4](../security/security-checklist.md#4-hardening-findings-this-phase), with the tests in the `security hardening` block of `security.int.test.ts` and in `env-rules.test.ts`.

## 5. Accepted risks and follow-ups

| Item | Severity | Why accepted / plan |
|---|---|---|
| `uuid` < 11.1.1 (via `sequelize`), GHSA-w5hq-g745-h8pq | Moderate | Affects `v3/v5/v6` with a caller-provided buffer; Sequelize only uses `v4`, and we never call it with buffers. The fix would require a breaking Sequelize downgrade. Re-check on Sequelize updates |
| One P0 report hides a member from discovery | Design | Deliberate safety trade-off (fast protection, human review, never a ban). Rate-limited to 10 reports/day per reporter, and a moderator clears it on dismissal ([moderation §5](../safety/moderation-system.md#5-automatic-protection-and-what-is-never-automatic)) |
| Admin account lockout can be triggered by anyone knowing an admin email | Low | 15-minute lock; IP rate limit on login; the dummy hash hides account existence |
| In-memory rate limits | Low (single process) | Move to Redis before running several API processes |
| Photo/identity verification review not implemented | Gap | Only phone OTP verification exists; verified flags are set by trusted code paths only (tested) |
| No automated browser tests | Gap | See [testing strategy §8](testing-strategy.md#8-known-gaps) |
| Production CSP/HSTS at Nginx not yet deployed | Deployment | [Release checklist](release-checklist.md) item; configuration in [security best practices §5](../security/security-best-practices.md#5-nginx-and-deployment-assumptions) |
| Forced admin password change on first sign-in not implemented | Medium | There is no second factor, so deliver initial passwords over a secure channel ([security checklist §5](../security/security-checklist.md#5-before-launch-open-items)) |

## 6. How to re-run

```bash
cd apps/api
TEST_DATABASE_URL=postgres://…/garba_partner_test npx vitest run src/security   # attack suite + env security rules
npm audit --omit=dev   # from the repo root
```

When adding an endpoint, add it to the sweep lists in `security.int.test.ts` ([testing strategy §6](testing-strategy.md#6-rules-for-new-code)).
