# Garba Partner

**A safe, event-first platform for adults (18+) to discover Garba events, find a dance partner going to the same event, connect by mutual consent and chat in the app. Buying event passes will come later.**

> **Status:** Foundation complete. The monorepo, tooling, shared packages, API skeleton with `GET /api/v1/health`, and web/admin shells run. No product features yet (auth, profiles, events, matching, chat and payments come in later phases). See the [roadmap](#development-roadmap).

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
| Database | PostgreSQL *(from the database phase)* |
| ORM | Sequelize / sequelize-typescript with Umzug migrations *(from the database phase)* |
| Realtime | Socket.IO *(chat phase)* |
| Image storage | Cloudinary *(profile phase)* |
| Authentication | Mobile OTP + JWT access token + rotating refresh-token sessions *(auth phase)* |
| Payments | Razorpay *(post-MVP)* |
| Deployment | Nginx + PM2 on a VPS |

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | **22.12+** (22 or 24 LTS; `.nvmrc` pins 22) |
| npm | 10+ |
| Git | any recent version |

PostgreSQL, Cloudinary and an SMS provider are **not** needed yet.

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
- The defaults work for local development. The API validates its environment at startup and refuses to start if anything is invalid.
- Only `VITE_*` variables reach the browser. Never put secrets in them.
- Don't set `NODE_ENV` in `.env` (it would make Vite build development React bundles).

Full reference: [docs/setup/environment-variables.md](docs/setup/environment-variables.md).

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
| `npm run start:api` | Run the built API (`apps/api/dist`) |
| `npm run preview:web` / `preview:admin` | Serve the built web/admin apps |

Step-by-step guide and troubleshooting: [docs/setup/local-development.md](docs/setup/local-development.md).

## Available applications

| App | Workspace | Dev URL | Description |
|---|---|---|---|
| **API** | `@garba-partner/api` | http://127.0.0.1:4000/api/v1 | Express REST API. Currently: `GET /api/v1/health` |
| **Web** | `@garba-partner/web` | http://localhost:5173 | Member-facing app (mobile-first). Currently: landing shell with an API status indicator |
| **Admin** | `@garba-partner/admin` | http://localhost:5174 | Admin & moderation panel. Currently: console shell with an API status indicator |

Both Vite dev servers proxy `/api` to the API, so the apps use same-origin requests, as they will in production behind Nginx.

```bash
curl http://127.0.0.1:4000/api/v1/health
# {"success":true,"message":"OK","data":{"status":"ok","timestamp":"..."}}
```

## Project structure

```text
garba-partner/
├── apps/
│   ├── api/          # @garba-partner/api   — Express REST API (/api/v1)
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
| **0** | Foundation | Monorepo, `packages/config` & `packages/shared`, TypeScript/ESLint/Prettier, API skeleton (health, envelope, error handling, redacted logging, tests), web/admin shells, setup docs | ✅ Done. Still open from the planned scope: CI workflow, PR template, DB connection + migration runner (moved to Phase 1) |
| **1** | Member auth & profile | PostgreSQL + migrations, OTP login, sessions, onboarding with 18+ gate, profile, photo upload with EXIF stripping, cities/areas, settings, account deletion | ⏳ Next |
| **2** | Admin foundation & events | Admin auth + TOTP, roles, audit log, admin management, cities/areas CRUD, events CRUD/publish/cancel, member events & attendance, in-app notifications | Planned |
| **3** | Discovery, interests, matches & safety core | Event & city discovery, interests, matches, unmatch, block, report user, auto-hide, report queue, sanctions, user management | Planned |
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
