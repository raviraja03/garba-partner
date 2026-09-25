# Development Rules — Garba Partner

> Related: [Coding standards](coding-standards.md), [Git workflow](git-workflow.md), [MVP scope](../product/MVP-scope.md), root `CLAUDE.md`

These rules are **mandatory** for every contributor, human or AI assistant. They expand on the rules in the root `CLAUDE.md`. If the two ever conflict, `CLAUDE.md` wins until both are reconciled.

## 1. Non-negotiable rules

### 1.1 Architecture

1. The monorepo layout (`apps/web`, `apps/admin`, `apps/api`, `packages/config`, `packages/shared`) and the technology choices in the [README](../../README.md#technology-stack) **must not change without explicit approval** (recorded as an ADR, see §8).
2. Shared types, enums, constants, Zod schemas, error codes and socket contracts live **only** in `packages/shared`. Duplicates are a review blocker.
3. Shared configuration utilities (env schema, tsconfig/ESLint/Prettier/Tailwind presets) live **only** in `packages/config`.
4. Controllers are thin, and business logic lives in services. Use repository/query modules only when they add clear value.
5. Prefer the simplest implementation that meets the MVP. Don't build for hypothetical future needs. The seams in [system architecture §8.2](../architecture/system-architecture.md#82-seams-that-already-exist-in-the-mvp-cheap-now-valuable-later) are the only planned "future-proofing".
6. Don't install unnecessary dependencies (see [coding standards §9](coding-standards.md#9-dependencies)).
7. Don't build out-of-scope features ([MVP scope §3](../product/MVP-scope.md#3-explicitly-out-of-scope-mvp)), even partially, without a scope change.

### 1.2 Safety and privacy

1. The platform is **18+**. Never weaken the age gate.
2. **Never** store raw Aadhaar numbers, masked Aadhaar numbers, Aadhaar images or e-KYC payloads.
3. **Never** expose phone numbers, DOB, exact locations, event attendance (outside reciprocal event mode) or verification selfies to other members.
4. **Never** log OTPs, tokens, passwords, phone numbers or message bodies.
5. **Never** present verification as a guarantee of safety or identity.
6. Every endpoint and socket event where one member affects or sees another **must** enforce blocks and suspensions through the interaction gate. Restrictions must not be bypassable through another API.
7. Members must always be able to block, report users, report messages and reach the safety centre.
8. Never trust client-side authorization. The server decides everything.

### 1.3 Data and database

1. **Every schema change uses a migration.** Never `sync()`, and never manual DDL in shared environments.
2. UUID PKs, foreign keys, required indexes, unique constraints, and transactions for multi-step writes ([database architecture](../architecture/database-architecture.md)).
3. **Never modify production data through ad-hoc scripts.** Data fixes are reviewed migrations or reviewed one-off scripts committed to the repo, run with a backup taken first, and logged.
4. **Never copy production data** to development, staging or a personal machine.
5. Keep queries indexed and paginated with cursors.

### 1.4 API

1. All routes are versioned under `/api/v1`. Admin routes are under `/api/v1/admin`.
2. Use the standard envelope `{ success, message, data }` for success and `{ success: false, message, error: { code, details } }` for errors.
3. Validate all input with strict shared Zod schemas.
4. Every protected route has explicit authentication and authorization middleware plus service-level ownership checks (IDOR prevention).
5. Rate-limit sensitive endpoints (auth, uploads, interests, messages, reports, verification).
6. Production errors never expose stack traces, SQL or sensitive data.
7. Payment webhooks (post-MVP) are verified server-side, always.

### 1.5 Secrets and configuration

1. Secrets live only in environment variables. **Never commit `.env`.**
2. Every new env var is added to the Zod schema in `packages/config` **and** to `.env.example` (placeholder value) in the same PR.
3. Client-exposed variables must start with `VITE_` and must never contain secrets.

### 1.6 Change safety

1. Don't break existing functionality. Don't remove functionality without approval.
2. Don't modify unrelated files.
3. **Never claim something was tested if it wasn't actually tested.** Report skipped steps honestly.

## 2. Definition of done

A task, feature or phase is **not complete** until all of these hold:

1. ✅ Implementation complete against its acceptance criteria ([MVP scope](../product/MVP-scope.md)).
2. ✅ `npm run typecheck` passes.
3. ✅ `npm run lint` passes (and `format:check`).
4. ✅ `npm run test` passes, and new business/safety logic has tests (happy, forbidden/IDOR, blocked, suspended paths as applicable).
5. ✅ `npm run build` passes.
6. ✅ Documentation updated (feature doc per §6 + relevant architecture docs).
7. ✅ README updated if setup, scripts or the roadmap changed.
8. ✅ No obvious security issue remains (security checklist in the PR template).
9. ✅ No unrelated files changed.
10. ✅ A final summary is provided containing:
    - files changed
    - features implemented
    - database changes
    - APIs added
    - tests added
    - documentation updated
    - known limitations
    - next recommended phase

## 3. Per-feature safety review

Answer these for every feature that touches members. Put the answers in the PR description or feature doc.

| # | Question |
|---|---|
| 1 | What member data does this read, write or return? Is any of it private (phone, DOB, location, attendance, selfie, messages)? |
| 2 | Can member A use this to see, contact or locate member B without B's consent? |
| 3 | Is the interaction gate applied? What happens if A and B have blocked each other? |
| 4 | What happens if the caller or the target is suspended, banned or pending deletion? |
| 5 | Can the caller access someone else's resource by changing an ID (IDOR)? |
| 6 | Can this be abused at volume (spam, scraping, enumeration)? Is there a rate limit? |
| 7 | Does any copy imply safety guarantees? |
| 8 | Does it add data we must include in the privacy policy or retention plan? |
| 9 | Is anything sensitive written to logs, errors, analytics or third parties? |

## 4. Environments and local development

### 4.1 Prerequisites (to be finalised in Phase 0)

- Node.js 22.12+ (22 or 24 LTS), npm 10+
- PostgreSQL 16+ running locally (or via Docker if the team opts in, which isn't required)
- A Cloudinary dev account (or the mocked `MediaStorage` for offline work)

### 4.2 Planned local workflow

```bash
cp .env.example .env               # fill local values; never commit .env
npm install
npm run db:migrate
npm run db:seed -- reference        # cities/areas
npm run db:seed -- dev-fixtures     # fake data, development only
npm run dev                         # api :4000, web :5173, admin :5174
```

- Log in locally with a number from `TEST_OTP_PHONES` and `TEST_OTP_CODE` (development only). Real SMS is never sent in development.
- The first admin: `npm run db:seed -- bootstrap-admin -w apps/api`.

### 4.3 Test data

Use only fake data: generated names, placeholder images, and numbers from a reserved fake range. Never use real people's photos or numbers.

## 5. Database change process

1. Update the design in [database architecture](../architecture/database-architecture.md) (in the same PR).
2. Write the migration (`up` + working `down`) and update the model.
3. Run `db:migrate`, `db:migrate:down`, `db:migrate` locally, and the integration tests.
4. For large tables in production, use concurrent index builds and expand/contract.
5. Deployment always takes a DB backup before migrating.

## 6. Feature documentation template

Each completed feature gets (or updates) a file under `docs/features/<feature>.md`:

```markdown
# <Feature name>

## Purpose
Why this exists; link to MVP scope item and user flow section.

## Architecture
Modules, services, key decisions, sequence diagram if non-trivial.

## API endpoints
| Method | Path | Auth | Description |

## Request / response examples
Realistic JSON (fake data only) for success and main error cases.

## Socket events (if any)

## Database changes
Tables/columns/indexes/constraints and migration file names.

## Security & safety considerations
Answers to the per-feature safety review (development-rules §3).

## Edge cases
Enumerated list with expected behaviour.

## Testing instructions
How to run automated tests; manual QA steps.

## Known limitations
```

## 7. Working with AI coding assistants

- Assistants must follow `CLAUDE.md` and these docs, work phase by phase, and produce the final summary from §2.
- Review AI-generated code with the same (or more) scrutiny, especially authorization, SQL and crypto.
- Don't paste secrets, production data or real user data into prompts.

## 8. Architecture decision records (ADRs)

Significant decisions (changing a technology, adding infrastructure such as Redis, changing the auth model, changing data retention) are recorded in `docs/architecture/decisions/NNNN-title.md` using: **Context → Decision → Alternatives → Consequences → Status**. An ADR must be approved before any implementation that changes the approved architecture.

Baseline decisions already made (documented in these architecture docs, so no separate ADR is needed):

| Decision | Where |
|---|---|
| Modular monolith + separate worker process | [System architecture §1, §3](../architecture/system-architecture.md) |
| Same-origin API behind Nginx, cookie-scoped refresh tokens | [System architecture §4.1](../architecture/system-architecture.md#41-domains-and-routing) |
| OTP + short JWT + rotating DB-backed refresh tokens | [Security architecture §3](../architecture/security-architecture.md#3-authentication) |
| Request → accept matching model | [User flows §7](../product/user-flows.md#7-interest-and-matching-flow) |
| Photo verification (moderator-reviewed) at MVP; ID verification deferred | [User flows §4](../product/user-flows.md#4-photo-verification-flow) |
| Post-moderation of photos | [User flows §12.5](../product/user-flows.md#125-photo-moderation-post-moderation) |
| No Redis, queues or microservices in the MVP | [MVP scope §3](../product/MVP-scope.md#3-explicitly-out-of-scope-mvp) |
| Umzug TypeScript migrations, varchar + CHECK instead of PG enums | [Database architecture §1, §5](../architecture/database-architecture.md) |
