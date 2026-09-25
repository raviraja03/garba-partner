# MVP Scope — Garba Partner

> Related: [Product overview](product-overview.md), [User flows](user-flows.md), [Development rules](../development/development-rules.md)

The MVP is the **smallest product that is useful and safe**. A feature is in scope only if a Navratri-season launch fails without it, or if it's a safety or legal requirement.

## 1. MVP goal

A logged-in adult in a launch city can:

1. find an upcoming Garba event,
2. find someone else looking for a partner at that event,
3. connect with them by mutual consent,
4. chat inside the app to plan meeting at the event,

…and can block or report anyone at any point. Moderators and event managers can run the platform from an admin panel.

## 2. In scope

Each item has acceptance criteria (AC). An item is done only when every AC passes and the phase checklist in [development rules](../development/development-rules.md#2-definition-of-done) is met.

### 2.1 Foundation

| Item | Acceptance criteria |
|---|---|
| Monorepo (`apps/web`, `apps/admin`, `apps/api`, `packages/shared`, `packages/config`) with npm workspaces | `npm install`, `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build` succeed from the root |
| Shared package | Enums, limits, DTO types, Zod schemas, error codes and socket event names are exported from `@garba-partner/shared`. No duplicates in the apps |
| Config package | Env loading and validation (Zod). The API refuses to boot if env is invalid. Shared tsconfig/ESLint/Prettier/Tailwind presets |
| Database migrations | Umzug-driven TypeScript migrations. `sequelize.sync()` is never used outside tests |
| CI | GitHub Actions runs typecheck, lint, test and build on every PR |

### 2.2 Member features

| Item | Acceptance criteria |
|---|---|
| **OTP login** | All rules in [user flows §2](user-flows.md#2-authentication-flow). OTPs are never logged. Rate limits enforced. Response doesn't allow enumeration |
| **Sessions** | 15-min JWT access tokens. Rotating, hashed refresh token in an httpOnly cookie. Reuse detection (with a multi-tab grace window). Logout / log out of all devices |
| **Onboarding + 18+ gate** | Under-18 rejected with DOB locked. Terms version stored. Not discoverable until the profile and ≥1 photo exist |
| **Profile edit** | All fields editable except DOB. Validation rejects phone/URL/email in name and bio |
| **Photos** | 1–6 photos. Type, size and dimension validated with magic-byte checks. EXIF/GPS stripped (test proves it). Reorder and delete |
| **Photo verification** | Gesture selfie → moderator review → badge. Selfie stored privately and deleted 30 days after the decision. The badge explanation contains the "does not guarantee safety" statement |
| **Events (member)** | List by city/date, detail, Going/Interested, "looking for partner" toggle, My events. Counts only. No attendee lists |
| **Discovery** | Event mode (reciprocal) and city mode. All eligibility rules from [user flows §6.1](user-flows.md#61-eligibility-filter-applied-server-side-to-every-candidate-in-both-modes) enforced in SQL. Filters. Cursor pagination |
| **Interests** | Send (25/day), accept, decline (silent), withdraw, 14-day expiry, mutual auto-match, 30-day decline cooldown |
| **Matches** | List, unmatch |
| **Chat** | Socket.IO text chat for active matches only. REST history and fallback send. Idempotent sends. Read receipts. Contact-sharing nudge. Rate limits |
| **Block** | From every entry point. Symmetric invisibility. Ends match and interests. Unblock list |
| **Report** | User and message reports. Snapshots. Priorities. Auto-hide rules |
| **In-app notifications** | New interest, new match, verification result, event cancelled/updated, warning/sanction notice, report acknowledgement. Unread count |
| **Safety centre** | Static page: meeting tips, what verification means, how to block/report, helplines (112 national emergency; cyber-crime helpline 1930 / cybercrime.gov.in; state women's helplines. **Verify all numbers before launch**) |
| **Settings** | Discovery toggle, show-area toggle, blocked list, logout-all, legal pages, grievance contact |
| **Account deletion** | Immediate deactivation, 30-day restore window, then purge/anonymise job |

### 2.3 Admin features

| Item | Acceptance criteria |
|---|---|
| **Admin auth** | Email + password (Argon2id) + mandatory TOTP. Forced password change and TOTP enrolment on first login. Lockout after 5 failures |
| **Roles** | `super_admin`, `moderator`, `event_manager`, enforced server-side per route ([matrix](../architecture/application-architecture.md#73-admin-role-permission-matrix)) |
| **Dashboard** | Counts listed in [user flows §12.10](user-flows.md#1210-dashboard) |
| **User management** | Search (ID, name, phone-by-hash), detail, sanction, revoke sanction, super-admin phone reveal with reason |
| **Reports queue** | Filter, assign, resolve with an action and note. Grouped view per reported user |
| **Verification queue** | Signed-URL selfie viewer, approve/reject with reason |
| **Photo review queue** | Approve/reject with reason |
| **Events** | CRUD, draft/publish/cancel, cover upload, attendee notifications on material change or cancellation |
| **Cities/areas** | CRUD and activate/deactivate |
| **Audit log** | Every admin write action is logged and viewable by super admins (filter by admin, action, target) |
| **Admin account management** | Super admin creates, deactivates and changes roles for admins, and resets TOTP |

### 2.4 Non-functional

| Item | Acceptance criteria |
|---|---|
| Security | All controls in [security architecture](../architecture/security-architecture.md) marked **MVP** are implemented and checked in the launch review |
| Performance | p95 API latency < 300 ms for discovery/list endpoints at 200 req/s on the target VPS (load-tested before launch) |
| Availability | PM2 auto-restart. Nginx health check. Daily encrypted off-site DB backups with a **tested restore** |
| Accessibility | Mobile-first, AA contrast, keyboard-usable admin |
| Legal pages | Terms, privacy policy, community guidelines and grievance officer published and versioned |

## 3. Explicitly out of scope (MVP)

These are **not** to be built in the MVP, even partially, unless the scope is formally changed.

| Feature | Why deferred |
|---|---|
| Razorpay pass purchase, tickets, QR check-in, refunds | Planned for phase 2 (see §6). The event listing shows price text and an optional external link only. No payment tables are created yet |
| ID/Aadhaar/DigiLocker age verification | Needs a licensed provider, legal review and budget. Designed for, not built |
| Native mobile apps | Web-first. The responsive web app covers the MVP |
| Web push / SMS / email notifications (other than OTP) | In-app only in the MVP. Web push is the first post-MVP addition |
| Image, voice or video messages; typing indicators; online/last-seen status | Abuse and privacy risk, plus complexity |
| Group chats and group/crew partner finding | Doubles the matching and moderation model |
| Member-created events / organiser self-service | Needs organiser verification and moderation |
| Recommendations/ranking algorithms | Simple deterministic ordering is enough |
| Automated text moderation / ML | Manual moderation plus reports and nudges at MVP scale |
| Geolocation / "near me" / distance | Privacy risk. City and area are enough |
| Social login, email login, passwords for members | OTP only |
| Multi-language UI | English first |
| Redis, message queues, microservices, Kubernetes | Not needed at MVP scale (see [system architecture §8](../architecture/system-architecture.md#8-scalability-and-future-considerations)) |
| Third-party analytics/ads SDKs | Privacy. Use first-party aggregate metrics |
| Self-service data export | Manual via grievance process in the MVP |

## 4. Delivery phases

The order is chosen so that **no social surface ships without block and report**.

| Phase | Name | Contents | Exit criteria |
|---|---|---|---|
| **0** | Foundation | Monorepo scaffolding, config/shared packages, lint/format/test tooling, CI, API skeleton (health check, error handler, response envelope, logging with redaction), web/admin shells with Tailwind (routing added with the first real pages) | All root scripts pass. `GET /api/v1/health` works |
| **1** | Member auth & profile | DB connection + migration runner (moved from Phase 0), OTP (provider + dev test numbers), sessions, onboarding, 18+ gate, profile, photo upload/EXIF stripping, cities/areas seed, settings, account deletion (deactivation part) | A migration runs up and down. Member can sign up, onboard, edit profile, log out, delete |
| **2** | Admin foundation & events | Admin auth + TOTP, roles, audit log, admin account management, cities/areas CRUD, events CRUD/publish/cancel, member event list/detail/attendance, in-app notifications | Event manager publishes an event. Members mark attendance |
| **3** | Discovery, interests, matches & safety core | Eligibility query, event and city modes, interests, matches, unmatch, **block**, **report user**, auto-hide, admin reports queue + sanctions + user management | Two members can match. Block/report work at every entry point. Moderator can suspend/ban with immediate effect |
| **4** | Chat | Socket.IO server with auth, message send/history/read, REST fallback, message reports with snapshots, contact nudge, sanction/block enforcement in sockets | Matched members chat in realtime. Block/unmatch/sanction cut chat off immediately |
| **5** | Verification & moderation | Photo verification flow, verification queue, photo review queue, selfie retention job, badge + explanation, safety centre content | Verification end-to-end. Retention job tested |
| **6** | Hardening & launch | Security review against the checklist, load test, Nginx/PM2/VPS setup, TLS, backups + restore drill, legal pages, DLT templates, grievance officer, seed launch cities/events, runbooks | [Launch checklist](#5-launch-checklist) is fully checked |

Each phase follows the completion rules in `CLAUDE.md` and [development rules](../development/development-rules.md).

## 5. Launch checklist

- [ ] All MVP ACs above pass. No P0/P1 bugs open.
- [ ] Security review done against [security architecture §13](../architecture/security-architecture.md#13-security-checklist-mvp-launch-gate).
- [ ] Penetration-style test of IDOR, block bypass and suspension bypass across **all** endpoints and socket events.
- [ ] EXIF/GPS stripping verified on real phone photos.
- [ ] Load test passed. The DB has the indexes listed in [database architecture](../architecture/database-architecture.md).
- [ ] Backup restore tested on a fresh server.
- [ ] SMS DLT sender ID and templates approved. Production SMS provider live.
- [ ] Legal: Terms, Privacy Policy, Community Guidelines and Grievance Officer published. Counsel sign-off on DPDP/IT Rules items.
- [ ] Moderator rota for event season, with trained moderators and a written moderation playbook.
- [ ] Helpline numbers in the safety centre verified.
- [ ] Launch cities and first events seeded.
- [ ] Monitoring and alerting (uptime, error rate, disk, DB backups) active.

## 6. Post-MVP roadmap (indicative, not committed)

1. **Web push notifications** (new message, match, interest).
2. **Razorpay pass purchase**: orders, server-side signature verification, webhook verification, digital passes with QR, refunds via Razorpay, admin reconciliation. Design notes are in [database architecture §7](../architecture/database-architecture.md#7-future-schema-post-mvp-not-created-in-mvp).
3. **ID/age verification** through a licensed provider (outcome-only storage).
4. Organiser portal (verified organisers submit events for approval).
5. Image messages with moderation.
6. Group partner finding ("we're 3, looking for 2 more").
7. Gujarati/Hindi UI.
8. Native apps (or a PWA install flow) if web usage data supports it.

## 7. Open questions (to resolve before or during Phase 0)

| # | Question | Default if not decided |
|---|---|---|
| 1 | Production domain name | `garbapartner.example` placeholder in docs |
| 2 | SMS provider (MSG91 vs Twilio Verify vs other) | MSG91 (India DLT support), behind an `SmsProvider` interface |
| 3 | Launch cities | Ahmedabad, Vadodara, Surat, Mumbai, Pune, Bengaluru |
| 4 | Whether to buy Cloudinary's AI moderation add-on | No. Manual post-moderation |
| 5 | Managed PostgreSQL vs on-VPS PostgreSQL | On-VPS with off-site backups. Move to managed when budget allows |
| 6 | Legal retention periods for report evidence and logs | 180 days (placeholder, **counsel to confirm**) |
