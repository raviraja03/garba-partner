# Garba Partner

**A safe, event-first platform for adults (18+) to discover Garba events, find a dance partner going to the same event, connect by mutual consent and chat in the app. Buying event passes will come later.**

> **Status:** Foundation, database, authentication, the **user profile system** and **event management** are complete: OTP login, onboarding with an 18+ gate, profiles and preferences, Cloudinary photo upload (EXIF stripped), admin user management, and events with organizers (public event browsing with city/date filters, verified-organizer badges, admin create/edit/publish/verify/archive). **Partner discovery** and **interests & matches** are live: ranked suggestions filtered by mutual preferences, city, date, level, event and verification; request → accept interests with exactly one match per pair; block, report and admin match moderation. **Real-time chat** (Socket.IO) connects matched members, with read receipts, unread counts, message reports and an admin reports queue with audited conversation review. The **safety and moderation system** is complete: reports with product reasons, block/unblock, warnings, chat restrictions, timed suspensions and bans (always decided by a moderator), automated suspicious-activity flags, scam/money warnings, a safety centre and community guidelines, and audited admin actions with safety and audit log viewers. **In-app notifications** (bell with unread count, live over Socket.IO) cover interests, matches, messages, event reminders and safety notices, with per-type preferences and admin monitoring. **Event passes** can be bought on the platform with **Razorpay** (server-verified payments, signed webhooks, idempotent orders, capacity holds, automatic and admin refunds, booking codes). The **admin dashboard** shows role-scoped aggregate metrics (members, events, matches, reports, bookings, revenue) with date and city filters, trend charts and an audited per-event sales export. See the [roadmap](#development-roadmap).

---

## Product overview

Many people skip Navratri events, or dance at the edges, because their friends aren't going, they are new to a city, or they want a partner at their own level. Garba Partner connects them through the events themselves:

1. **Discover events.** Browse curated Garba/Dandiya events in your city.
2. **Say you're going.** Optionally turn on *"I'm looking for a partner for this event"*.
3. **Find partners.** See other adults looking for a partner at the same event (or in your city), filtered by experience and style.
4. **Connect by consent.** Send an interest. A chat opens only if they accept.
5. **Chat and meet at the event.** In-app chat. Phone numbers are never shared by the platform.
6. **Buy passes** through Razorpay (UPI, cards, net banking).

### Safety & privacy by design

- **18+ only**, with a date-of-birth gate.
- **No messages without mutual consent** (interest → accept → match).
- **Phone numbers, exact locations and event plans are never shown** to other members. Event attendance is visible only to others who are also looking for a partner at that event.
- **Block, report user, report message and the safety centre** are available everywhere.
- **Photo verification** is reviewed by moderators. It confirms only that a live selfie matches the profile photos and **does not guarantee a person's identity or safety**.
- **No Aadhaar numbers or images are stored.**

See [Product overview](docs/product/product-overview.md) for the full vision, roles and principles.

---

## Technology stack

| Layer | Technology |
|---|---|
| Monorepo | npm workspaces, TypeScript 6 (strict), ESLint 9 (type-aware) + Prettier |
| Web app | React 19 + Vite 8 + TypeScript + Tailwind CSS 4 |
| Admin panel | React 19 + Vite 8 + TypeScript + Tailwind CSS 4 |
| API | Node.js + Express 5 + TypeScript, pino logging, helmet, Vitest + Supertest |
| Database | PostgreSQL 16+ |
| ORM | Sequelize 6 / sequelize-typescript, Umzug TypeScript migrations and seeders |
| Realtime | Socket.IO *(chat phase)* |
| Image storage | Cloudinary (server-side signed uploads; images re-encoded with sharp, EXIF/GPS removed). Local disk storage for development |
| Authentication | Members: mobile OTP. Admins: email + Argon2id password. Short-lived JWT access tokens (`jose`) + rotating refresh tokens in httpOnly cookies, sessions in PostgreSQL |
| Payments | Razorpay (REST API + hosted Checkout, no SDK) |
| Deployment | Nginx + PM2 on a VPS |

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | **22.12+** (22 or 24 LTS; `.nvmrc` pins 22) |
| npm | 10+ |
| Git | any recent version |
| PostgreSQL | **16+** (local server on `127.0.0.1:5432`) |

Cloudinary and an SMS provider are **not** needed yet.

## Installation

```bash
git clone <repo-url> garba-partner
cd garba-partner
npm install          # installs all workspaces and builds packages/config + packages/shared
```

## Environment setup

```bash
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
```

- `.env` lives at the repo root and is **git-ignored. Never commit it.** `.env.example` documents every variable.
- Fill in the required values: create the database role and databases, then set `DATABASE_URL` and `TEST_DATABASE_URL` ([docs/database/database-setup.md](docs/database/database-setup.md)). Generate `PHONE_HASH_SECRET`, `PHONE_ENCRYPTION_KEY`, `OTP_HMAC_SECRET`, `JWT_ACCESS_SECRET` and `JWT_ADMIN_ACCESS_SECRET` with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Everything else works as-is locally.
- The API validates its environment at startup and refuses to start if anything is invalid.
- Only `VITE_*` variables reach the browser. Never put secrets in them.
- Don't set `NODE_ENV` in `.env` (it would make Vite build development React bundles).

Full reference: [docs/setup/environment-variables.md](docs/setup/environment-variables.md).

## Database setup

```bash
npm run db:migrate    # create the schema
npm run db:seed       # fictional development users, admins, organizers and events (never runs in production)
```

Step-by-step guide (roles, databases, troubleshooting): [docs/database/database-setup.md](docs/database/database-setup.md).

## Logging in locally

- **Web** (http://localhost:5173): enter any Indian mobile number (e.g. `98765 00123`). No SMS is sent in development. The OTP screen shows the code in a "Development only" banner. This mechanism is refused outside `APP_ENV=development`.
- **Admin** (http://localhost:5174): after `npm run db:seed`, sign in as `superadmin@garbapartner.test` (or `moderator@…`, `events@…`) with the development password `garba-dev-admin-2026`. The event manager (`events@…`) manages events and organizers; moderators can view them only.
- **Home** (http://localhost:5173): visitors see the landing page (what GarbaMates is, why it was built, how to join); signed-in members see their own home at the same address.
- **Events** (http://localhost:5173/events): public, no login needed. The seed adds three published events and one draft.
- **Real admin accounts:** `npm run admin:create -- --email you@example.com --name "Your Name" --role super_admin` prints a one-time random password.

Details: [docs/auth/authentication.md](docs/auth/authentication.md).

## Development commands

Run from the repository root:

| Command | Description |
|---|---|
| `npm run dev` | Start everything: package watcher, API, web and admin |
| `npm run dev:api` / `dev:web` / `dev:admin` | Start a single app |
| `npm run build:packages` | Build `packages/config` and `packages/shared` |
| `npm run typecheck` | Type-check all workspaces |
| `npm run lint` / `lint:fix` | ESLint across the repo |
| `npm run format` / `format:check` | Prettier write / check |
| `npm run test` | Run tests (Vitest) |
| `npm run build` | Production build of all workspaces |
| `npm run check` | format:check → lint → typecheck → test → build |
| `npm run db:migrate` / `db:migrate:undo` / `db:migrate:status` | Apply / revert last / list migrations |
| `npm run db:seed` / `db:seed:undo` | Load / remove fictional development data |
| `npm run db:reset` | Rebuild the development database (undo all → migrate → seed) |
| `npm run admin:create -- --email … --name … --role …` | Create an admin account (prints a one-time password) |
| `npm run start:api` | Run the built API (`apps/api/dist`) |
| `npm run env:check -w @garba-partner/api` | Validate the environment exactly as the API does at startup and print the non-secret settings |
| `npm run preview:web` / `preview:admin` | Serve the built web/admin apps |

Step-by-step guide and troubleshooting: [docs/setup/local-development.md](docs/setup/local-development.md).

## Available applications

| App | Workspace | Dev URL | Description |
|---|---|---|---|
| **API** | `@garba-partner/api` | http://127.0.0.1:4000/api/v1 | Express REST API + PostgreSQL. Currently: health, member auth (`/auth/*`), profiles (`/me/*`, `/users/:id/profile`), cities, public events (`/events`), attendance, discovery (`/partners`), interests and matches, blocks and reports, admin auth, users, events and organizers (`/admin/*`); Socket.IO chat at `/socket.io` and chat REST (`/chats/*`), admin reports (`/admin/reports`) |
| **Web** | `@garba-partner/web` | http://localhost:5173 | Member-facing app (mobile-first). Currently: login/OTP, onboarding, profile, photo upload, preferences, public events list and detail, event attendance ("looking for a partner"), **Discover** (filters, verified only, partner profile), **Interests** (received/sent: accept, decline, withdraw), **Matches** (match screen, unmatch, block, report), **Chats** (live messages, unread badge, read receipts, report message, block) |
| **Admin** | `@garba-partner/admin` | http://localhost:5174 | Admin & moderation panel. Currently: admin login, role-based navigation, users (with match history, close match, interaction restriction), **events** (create/edit/publish/verify/archive, image upload) and **organizers**, **reports queue** (evidence, audited conversation review, resolve: dismiss/warn/suspend/ban) |

Both Vite dev servers proxy `/api` to the API, so locally the apps use same-origin requests. In production the apps call the API on its own domain (`https://<API_DOMAIN>`, set by `VITE_API_BASE_URL`): see [production setup](docs/deployment/production-setup.md).

```bash
curl http://127.0.0.1:4000/api/v1/health
# {"success":true,"message":"OK","data":{"status":"ok","database":"ok","timestamp":"..."}}
```

## Project structure

```text
garba-partner/
├── apps/
│   ├── api/          # @garba-partner/api   — Express REST API (/api/v1), models, migrations, seeders
│   ├── web/          # @garba-partner/web   — member web app (React + Vite + Tailwind)
│   └── admin/        # @garba-partner/admin — admin panel (React + Vite + Tailwind)
├── packages/
│   ├── config/       # @garba-partner/config — env validation, tsconfig/ESLint/Prettier/Tailwind presets
│   └── shared/       # @garba-partner/shared — shared types, constants, error codes, API contracts
├── deploy/           # production deployment: Nginx templates, PostgreSQL setup, scripts, env template
├── docs/             # product, architecture, development and setup documentation
├── ecosystem.config.cjs  # PM2 process file (production)
├── .env.example      # environment template (committed)
├── .env              # local environment (git-ignored)
├── eslint.config.js
├── package.json      # npm workspaces + root scripts
├── tsconfig.json     # solution file referencing all workspaces
└── README.md
```

Details (dependency rules, TypeScript presets, where new code goes): [docs/setup/project-structure.md](docs/setup/project-structure.md).

---

## Documentation

### Setup

| Document | Contents |
|---|---|
| [Local development](docs/setup/local-development.md) | Prerequisites, install, running apps, quality checks, troubleshooting |
| [Environment variables](docs/setup/environment-variables.md) | Every variable, validation, planned variables, rules for adding new ones |
| [Project structure](docs/setup/project-structure.md) | Workspaces, dependency rules, TypeScript/ESLint configuration |

### Authentication

| Document | Contents |
|---|---|
| [Authentication](docs/auth/authentication.md) | Overview and **API reference for every auth endpoint** (member + admin), rate limits, local login, tests, known limitations |
| [OTP flow](docs/auth/otp-flow.md) | Sequence, rules, storage/privacy, development OTP mechanism, edge cases |
| [Session management](docs/auth/session-management.md) | JWT + refresh-token strategy, rotation and reuse detection, CSRF, client behaviour |
| [Authorization](docs/auth/authorization.md) | Middleware, member status matrix, admin permission matrix, user/admin separation |

### Users & profiles

| Document | Contents |
|---|---|
| [User profile](docs/users/user-profile.md) | Fields, profile status and completion %, **API reference** (member + admin), web/admin screens, tests |
| [Profile validation](docs/users/profile-validation.md) | Every field rule, 18+ rules, preferences, image rules, DB backstops |
| [Cloudinary](docs/users/cloudinary.md) | Image pipeline, EXIF stripping, configuration, local dev storage |
| [Privacy rules](docs/users/privacy-rules.md) | Who can see what, enforcement, checklist for new features |

### Events

| Document | Contents |
|---|---|
| [Event management](docs/events/event-management.md) | Fields, lifecycle (draft/published/archived), verification, web and admin screens, security, edge cases, tests |
| [Organizer management](docs/events/organizer-management.md) | Public vs private organizer fields, how private info is protected, verification, archiving |
| [Event API](docs/events/event-api.md) | **API reference**: public list/detail, admin events and organizers, pagination/filtering/sorting, examples, errors |

### Matching

| Document | Contents |
|---|---|
| [Discovery](docs/matching/discovery.md) | **API reference** (`/partners`, attendance, blocks, reports), web screens, edge cases, tests |
| [Matching logic](docs/matching/matching-logic.md) | Eligibility rules, ranking weights, pagination, why no score is shown, query and indexes |
| [Interests](docs/matching/interests.md) | **API reference** for sending, accepting, rejecting and withdrawing interests; rules, database guarantees, tests |
| [Matches](docs/matching/matches.md) | Match lifecycle, how matches end, **admin match moderation** and interaction restrictions, database guarantees |
| [Discovery privacy](docs/matching/privacy.md) | What members can see, reciprocal event attendance, blocks/reports, scraping controls, change checklist |

### Chat

| Document | Contents |
|---|---|
| [Chat architecture](docs/chat/architecture.md) | Components, data model, **REST API**, sending flow, read status, web client, scaling, tests |
| [Socket events](docs/chat/socket-events.md) | Connection and handshake auth, every client/server event, acknowledgements and error codes |
| [Chat moderation](docs/chat/moderation.md) | Message reports and evidence, **admin reports queue**, audited conversation access, resolutions |
| [Chat safety](docs/chat/safety.md) | Who can chat and how it is enforced, contact-sharing nudge, rate limits, retention, privacy |

### Testing & quality

| Document | Contents |
|---|---|
| [Testing strategy](docs/testing/testing-strategy.md) | Test layers, data isolation, how to run, coverage by area, rules for new code, known gaps |
| [Test cases](docs/testing/test-cases.md) | Test cases per area (auth, profile, events, discovery, interests, chat, safety, notifications, payments, admin), automated vs manual |
| [Security testing](docs/testing/security-testing.md) | Security QA results by category, **findings and fixes**, accepted risks, how to re-run |
| [Release checklist](docs/testing/release-checklist.md) | Code, database, staging, production configuration, post-deploy and sign-off |

### Security

| Document | Contents |
|---|---|
| [Security checklist](docs/security/security-checklist.md) | Current controls by area (auth, sessions, authorization, CORS/headers, rate limits, validation, uploads, database, Socket.IO, secrets, logging, audit), hardening findings and fixes, open items, residual risks |
| [Threat model](docs/security/threat-model.md) | Assets, actors, trust boundaries, entry points, STRIDE threats with mitigations, product abuse cases, assumptions |
| [Security best practices](docs/security/security-best-practices.md) | Rules for API and frontend code, secrets and key rotation, **Nginx configuration and deployment assumptions**, admin operations, PR checklist |

### Design

| Document | Contents |
|---|---|
| [Design system](docs/design/design-system.md) | GarbaMates brand colours and contrast rules, typography, spacing and shape tokens, logo usage, the reusable components (buttons, inputs, cards, badges, avatars, dialogs, navigation, footer), loading / empty / error states, accessibility checklist |

### Deployment

**Not deployed yet.** These documents prepare the production deployment; see the status and blockers in the first one.

| Document | Contents |
|---|---|
| [Production setup](docs/deployment/production-setup.md) | Status and blockers, architecture and domains, server preparation, env file, PostgreSQL roles, first and routine deploys, health checks, logging, **complete deployment checklist**, what was and was not tested |
| [Nginx](docs/deployment/nginx.md) | Templates and rendering, what each server block does, security headers and CSP, admin IP allow-list, troubleshooting |
| [PM2](docs/deployment/pm2.md) | Process file, why exactly one instance, commands, start on boot, logs |
| [SSL](docs/deployment/ssl.md) | First certificate, automatic renewal, changing domains, TLS decisions |
| [Database backup](docs/deployment/database-backup.md) | Strategy, encryption and off-site copy, restore drill, disaster recovery |
| [Rollback](docs/deployment/rollback.md) | Code rollback, migrations and what cannot be undone, rehearsal, decision guide |

### Admin

| Document | Contents |
|---|---|
| [Dashboard](docs/admin/dashboard.md) | Metrics and definitions, role-based sections, filters, **API reference**, charts, per-event table, justified CSV export, privacy, tests |

### Payments

| Document | Contents |
|---|---|
| [Razorpay](docs/payments/razorpay.md) | Integration architecture, configuration and **test credentials locally**, secrets handling, API calls, security |
| [Payment flow](docs/payments/payment-flow.md) | Event → order → Checkout → verification → booking; **API reference**, statuses, idempotency, transactions, failure handling, web flow, tests |
| [Webhook](docs/payments/webhook.md) | Signature verification over the raw body, events handled, idempotency, reconciliation, operations |
| [Refunds](docs/payments/refunds.md) | Automatic and admin refunds, refund status lifecycle, admin API, audit |

### Notifications

| Document | Contents |
|---|---|
| [Logging](docs/development/logging.md) | Request logging (`[API]` lines, `api_logs` table), what is never logged, the `LOG_OTP` debugging switch, how to read the logs |
| [MSG91 setup](docs/notifications/msg91.md) | What to create in MSG91 (auth key, DLT templates, WhatsApp templates), the env variables, the login-code and notification flows, the first-send check, troubleshooting |
| [Notification channels](docs/notifications/notification-channels.md) | SMS and WhatsApp delivery pipeline, the `notification_deliveries` history table, failure handling, duplicate prevention, how to add a real provider |
| [Notifications](docs/notifications/notifications.md) | Types and triggers, privacy rules, **API reference** (list, unread count, mark read, preferences), realtime event, jobs (event reminders, retention), admin monitoring, database, tests |

### Safety & moderation

| Document | Contents |
|---|---|
| [Moderation system](docs/safety/moderation-system.md) | Architecture, report reasons and priorities, automatic protection (and the no-auto-ban rule), **moderation queue API**, member notices API, database changes, tests |
| [Admin actions](docs/safety/admin-actions.md) | Review, warn, restrict chat, suspend, ban, dismiss, lift: effects, permissions, **API reference**, expiry job, audit trail |
| [Abuse prevention](docs/safety/abuse-prevention.md) | Blocking, every rate limit, suspicious-activity detection, scam/money warnings, safety logs, false reports, ban evasion |
| [Incident response](docs/safety/incident-response.md) | Severity levels, investigation tools, playbooks (threats, under-18, scams, compromised accounts, admin misuse), communication |
| [Community guidelines](docs/safety/community-guidelines.md) | The guidelines, where they are shown, how they map to report reasons |

### Database

| Document | Contents |
|---|---|
| [Database setup](docs/database/database-setup.md) | Local PostgreSQL setup, seed data, health check, production roles, troubleshooting |
| [Schema](docs/database/schema.md) | Mermaid ERD, every table/column/constraint/index, soft-delete strategy, privacy summary |
| [Relationships](docs/database/relationships.md) | Associations, FK actions, deletion behaviour, transactions |
| [Migration guide](docs/database/migration-guide.md) | Commands, writing migrations and seeders, testing, production procedure |

### Product

| Document | Contents |
|---|---|
| [Product overview](docs/product/product-overview.md) | Vision, problem, principles, user roles, feature summary, metrics, trust copy rules, legal considerations |
| [User personas](docs/product/user-personas.md) | Member and admin personas, anti-personas (threat actors) |
| [User flows](docs/product/user-flows.md) | End-to-end journeys: auth, onboarding/profile, verification, events, discovery, interests/matching, chat, block, report, deletion, admin journeys |
| [MVP scope](docs/product/MVP-scope.md) | In/out of scope with acceptance criteria, delivery phases, launch checklist, open questions |

### Architecture

| Document | Contents |
|---|---|
| [System architecture](docs/architecture/system-architecture.md) | Containers, VPS/Nginx/PM2 topology, environments & env vars, scheduled jobs, observability, scalability |
| [Application architecture](docs/architecture/application-architecture.md) | Monorepo & shared packages, API layers, endpoint catalogue, Socket.IO contract, admin & web frontend architecture, business limits |
| [Database architecture](docs/architecture/database-architecture.md) | Schema, constraints, indexes, discovery query, migrations, seeding, future payment schema |
| [Security architecture](docs/architecture/security-architecture.md) | Threat model, authentication, trust & safety, authorization/interaction gate, uploads, rate limits, privacy & retention, launch security checklist |

### Development

| Document | Contents |
|---|---|
| [Coding standards](docs/development/coding-standards.md) | TypeScript, naming, API and frontend patterns, testing, dependencies |
| [Git workflow](docs/development/git-workflow.md) | Branching, Conventional Commits, PRs, releases, hotfixes, CI |
| [Development rules](docs/development/development-rules.md) | Non-negotiable rules, definition of done, per-feature safety review, feature doc template, ADRs |

Contributors (and AI assistants) must also follow [CLAUDE.md](CLAUDE.md).

---

## Development roadmap

No social feature ships without **block and report**. Phase numbers follow [MVP scope §4](docs/product/MVP-scope.md#4-delivery-phases).

| Phase | Name | Scope | Status |
|---|---|---|---|
| — | Architecture & docs | Product, architecture and development documentation | ✅ Done |
| **0** | Foundation | Monorepo, `packages/config` & `packages/shared`, TypeScript/ESLint/Prettier, API skeleton (health, envelope, error handling, redacted logging, tests), web/admin shells, setup docs | ✅ Done. Still open from the planned scope: CI workflow, PR template |
| **1** | Member auth & profile | ✅ Database layer. ✅ Authentication (member OTP, admin password, sessions, middleware). ✅ **Profiles:** onboarding with 18+ gate, profile + preferences API, Cloudinary photo upload with EXIF stripping, completion % and status, public profile, cities/areas, admin user list/detail/suspend/reactivate + audit log. ⏳ **Remaining:** account deletion, "log out of all devices" UI | 🟡 Nearly done |
| **2** | Admin foundation & events | ✅ **Events:** organizers (public profile + private contact, verify, archive), events CRUD, publish/unpublish, verify, archive/restore, image upload, public list/detail with filters, sorting and pagination, web events pages. ⏳ **Remaining:** forced password change, admin management UI, cities/areas CRUD, attendance ("going"/"looking for a partner"), event cancellation with notice, in-app notifications | 🟡 In progress |
| **3** | Discovery, interests, matches & safety core | ✅ **Discovery** (`/partners`, mutual preferences, filters, deterministic ranking without exposing scores). ✅ **Interests & matches:** send/accept/reject/withdraw, mutual interest → exactly one match (DB-enforced), unmatch, block/report end matches, admin match history + close match + interaction restriction. ✅ Event attendance, **block**, **report user**, auto-hide. ⏳ **Remaining:** admin report queue, sanctions from reports | 🟡 Nearly done |
| **4** | Chat | ✅ Socket.IO chat (handshake auth, per-event session checks), history, read receipts, unread counts, REST fallback, message reports with evidence snapshots, contact-sharing nudge, live enforcement of blocks/unmatch/sanctions, admin reports queue with audited conversation review. ⏳ Retention purge job (hardening phase) | ✅ Done |
| **5** | Safety & moderation | ✅ Product report reasons, block/unblock UI, warnings with acknowledgement, chat restriction, timed suspensions, bans (manual, reviewed), sanction history, expiry job, suspicious-activity flags, scam/money warnings, safety centre, community guidelines, safety and audit log viewers. ⏳ Photo verification and photo/verification review queues, `banned_phone_hashes` (with account deletion) | ✅ Done (moderation) |
| **5b** | Notifications | ✅ In-app notifications (interest received/accepted, match, collapsed chat messages, event reminders, safety notices, report reviewed), unread/read, mark one/all, cursor pagination, per-type preferences, live `notification:new`, 90-day retention, admin monitoring. ⏳ Verification trigger (with the verification flow), web push/email | ✅ Done |
| **5c** | Event pass payments | ✅ Razorpay orders with server-computed amounts, idempotency keys, capacity holds, checkout signature + API verification, signed webhooks with de-duplication, reconciliation job, bookings with codes, automatic refunds (sold out, duplicates, unavailable events), admin refunds, pass settings, payments back office, booking notifications. ⏳ QR check-in, partial refunds, invoices | ✅ Done |
| **5d** | Admin dashboard | ✅ Aggregate metrics (members, active, verified, suspended, events, matches, pending reports, bookings, revenue), date and city filters, role-scoped sections, daily/weekly trend charts, paginated per-event table, audited per-event sales CSV | ✅ Done |
| **5e** | QA | ✅ Security QA (unauthorized access, JWT forgery, privilege escalation, IDOR, injection, XSS, uploads, CSRF, rate limits, logging), security test suite, 3 findings fixed (public profile visibility, phone numbers in logs, destructive DB commands on staging), test strategy, test cases, release checklist | ✅ Done |
| **5f** | Security hardening | ✅ Admin sign-in/lockout/logout audit, global per-IP rate limit, `no-store` on every API response, strict CORS methods/headers, HSTS 1 year, SQL values removed from error logs, env security-rule tests, [security docs](docs/security/security-checklist.md) with threat model and Nginx config. ⏳ Forced admin password change. Admin two-factor (authenticator) sign-in was built and then removed on request (migration `20261004100000-remove-admin-two-factor`) | ✅ Done |
| **5g** | Deployment preparation | ✅ Three configurable domains (web, admin, API) with the apps calling the API cross-origin, PM2 process file, Nginx templates rendered from env, least-privilege PostgreSQL roles and server settings, deploy / rollback / preflight / health-check / backup / restore scripts, log rotation, [deployment docs](docs/deployment/production-setup.md) with checklist. ⏳ **Not run on a server yet** | 🟡 Prepared, not deployed |
| **6** | Launch | **Configure MSG91 and confirm a real login code arrives (production cannot start without it)**, run the [deployment checklist](docs/deployment/production-setup.md#11-deployment-checklist) on the VPS, load test, restore drill and rollback rehearsal, admin second factor or IP allow-list, legal pages, Redis-backed rate limits, CI/CD | Planned |

### Post-MVP (indicative)

1. Web push notifications
2. ID/age verification via a licensed provider (outcome-only storage)
3. Organiser portal
4. Image messages with moderation
5. Group partner finding
6. Gujarati / Hindi UI

Details: [MVP scope §4–§6](docs/product/MVP-scope.md#4-delivery-phases).

---

## Contributing

- Read [Development rules](docs/development/development-rules.md) and [Git workflow](docs/development/git-workflow.md) first.
- Branch from `main` → PR with the security & safety checklist → squash merge.
- Run `npm run check` before pushing.
- Never commit `.env`, secrets or real user data.
