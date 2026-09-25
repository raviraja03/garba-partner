# Garba Partner

**A safe, event-first platform for adults (18+) to discover Garba events, find a dance partner going to the same event, connect by mutual consent and chat in the app. Buying event passes will come later.**

> **Status:** Architecture & documentation phase. No application code has been written yet. Implementation starts with [Phase 0 – Foundation](#development-roadmap).

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
| Web app | React + Vite + TypeScript + Tailwind CSS |
| Admin panel | React + Vite + TypeScript + Tailwind CSS |
| API | Node.js + Express.js + TypeScript |
| Database | PostgreSQL |
| ORM | Sequelize / sequelize-typescript (Umzug migrations) |
| Realtime | Socket.IO |
| Image storage | Cloudinary |
| Authentication | Mobile OTP + JWT access token + rotating refresh-token sessions |
| Payments | Razorpay (post-MVP) |
| Deployment | Nginx + PM2 on a VPS |

## Monorepo structure

```text
garba-partner/
├── apps/
│   ├── web/          # Member-facing web app (mobile-first SPA)
│   ├── admin/        # Admin & moderation panel
│   └── api/          # REST API (/api/v1), Socket.IO, scheduled-job worker
├── packages/
│   ├── config/       # Env validation, tsconfig/ESLint/Prettier/Tailwind presets
│   └── shared/       # Shared types, enums, constants, Zod schemas, error codes, socket contracts
├── docs/             # Product, architecture and development documentation
├── .env              # Local secrets (git-ignored, never committed)
├── .env.example      # Template of required environment variables
├── package.json      # npm workspaces + root scripts
├── tsconfig.json
└── README.md
```

---

## Documentation

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

## Getting started

> Setup scripts arrive in **Phase 0**. The planned workflow is:

```bash
cp .env.example .env        # fill in local values — never commit .env
npm install
npm run db:migrate
npm run db:seed -- reference
npm run dev                 # api :4000 · web :5173 · admin :5174
```

Prerequisites: Node.js 24 LTS, npm 10+, PostgreSQL 16+. See [Development rules §4](docs/development/development-rules.md#4-environments-and-local-development).

---

## Development roadmap

No social feature ships without **block and report**.

| Phase | Name | Scope | Status |
|---|---|---|---|
| — | Architecture & docs | Product, architecture and development documentation | ✅ Done |
| **0** | Foundation | Monorepo scaffolding, `packages/config` & `packages/shared`, lint/format/test tooling, CI, API skeleton (health, envelope, error handling, redacted logging), DB + migration runner, web/admin shells | ⏳ Next |
| **1** | Member auth & profile | OTP login, sessions, onboarding with 18+ gate, profile, photo upload with EXIF stripping, cities/areas, settings, account deletion | Planned |
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
- Never commit `.env`, secrets or real user data.
