# Garba Partner

**A safe, event-first platform for adults (18+) to discover Garba events, find a dance partner going to the same event, connect by mutual consent and chat in the app. Buying event passes will come later.**

> **Status:** Foundation, database, authentication, the **user profile system** and **event management** are complete: OTP login, onboarding with an 18+ gate, profiles and preferences, Cloudinary photo upload (EXIF stripped), admin user management, and events with organizers (public event browsing with city/date filters, verified-organizer badges, admin create/edit/publish/verify/archive). **Partner discovery** and **interests & matches** are live: ranked suggestions filtered by mutual preferences, city, date, level, event and verification; request → accept interests with exactly one match per pair; block, report and admin match moderation. Chat and payments come in later phases; identity verification and the admin reports queue are still pending. See the [roadmap](#development-roadmap).

---

## Product overview

Many people skip Navratri events, or dance at the edges, because their friends aren't going, they are new to a city, or they want a partner at their own level. Garba Partner connects them through the events themselves:

1. **Discover events.** Browse curated Garba/Dandiya events in your city.
2. **Say you're going.** Optionally turn on *"I'm looking for a partner for this event"*.
3. **Find partners.** See other adults looking for a partner at the same event (or in your city), filtered by experience and style.
4. **Connect by consent.** Send an interest. A chat opens only if they accept.
5. **Chat and meet at the event.** In-app chat. Phone numbers are never shared by the platform.
6. **(Later) Buy passes** through Razorpay.

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
| Payments | Razorpay *(post-MVP)* |
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
| `npm run preview:web` / `preview:admin` | Serve the built web/admin apps |

Step-by-step guide and troubleshooting: [docs/setup/local-development.md](docs/setup/local-development.md).

## Available applications

| App | Workspace | Dev URL | Description |
|---|---|---|---|
| **API** | `@garba-partner/api` | http://127.0.0.1:4000/api/v1 | Express REST API + PostgreSQL. Currently: health, member auth (`/auth/*`), profiles (`/me/*`, `/users/:id/profile`), cities, public events (`/events`), attendance, discovery (`/partners`), interests and matches, blocks and reports, admin auth, users, events and organizers (`/admin/*`) |
| **Web** | `@garba-partner/web` | http://localhost:5173 | Member-facing app (mobile-first). Currently: login/OTP, onboarding, profile, photo upload, preferences, public events list and detail, event attendance ("looking for a partner"), **Discover** (filters, verified only, partner profile), **Interests** (received/sent: accept, decline, withdraw), **Matches** (match screen, unmatch, block, report) |
| **Admin** | `@garba-partner/admin` | http://localhost:5174 | Admin & moderation panel. Currently: admin login, role-based navigation, users (with match history, close match, interaction restriction), **events** (create/edit/publish/verify/archive, image upload) and **organizers** |

Both Vite dev servers proxy `/api` to the API, so the apps use same-origin requests, as they will in production behind Nginx.

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
├── docs/             # product, architecture, development and setup documentation
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
| **2** | Admin foundation & events | ✅ **Events:** organizers (public profile + private contact, verify, archive), events CRUD, publish/unpublish, verify, archive/restore, image upload, public list/detail with filters, sorting and pagination, web events pages. ⏳ **Remaining:** admin TOTP 2FA + forced password change, admin management, cities/areas CRUD, attendance ("going"/"looking for a partner"), event cancellation with notice, in-app notifications | 🟡 In progress |
| **3** | Discovery, interests, matches & safety core | ✅ **Discovery** (`/partners`, mutual preferences, filters, deterministic ranking without exposing scores). ✅ **Interests & matches:** send/accept/reject/withdraw, mutual interest → exactly one match (DB-enforced), unmatch, block/report end matches, admin match history + close match + interaction restriction. ✅ Event attendance, **block**, **report user**, auto-hide. ⏳ **Remaining:** admin report queue, sanctions from reports | 🟡 Nearly done |
| **4** | Chat | Socket.IO chat, history, read receipts, message reports, contact-sharing nudge, realtime enforcement of blocks/sanctions | Planned |
| **5** | Verification & moderation | Photo verification, verification & photo review queues, selfie retention job, safety centre | Planned |
| **6** | Hardening & launch | Security review, load test, Nginx/PM2/VPS, TLS, backups & restore drill, legal pages, SMS DLT, runbooks | Planned |

### Post-MVP (indicative)

1. Web push notifications
2. Razorpay event pass purchase (orders, verified webhooks, digital passes, refunds)
3. ID/age verification via a licensed provider (outcome-only storage)
4. Organiser portal
5. Image messages with moderation
6. Group partner finding
7. Gujarati / Hindi UI

Details: [MVP scope §4–§6](docs/product/MVP-scope.md#4-delivery-phases).

---

## Contributing

- Read [Development rules](docs/development/development-rules.md) and [Git workflow](docs/development/git-workflow.md) first.
- Branch from `main` → PR with the security & safety checklist → squash merge.
- Run `npm run check` before pushing.
- Never commit `.env`, secrets or real user data.
