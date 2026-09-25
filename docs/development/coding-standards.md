# Coding Standards — Garba Partner

> Related: [Development rules](development-rules.md), [Git workflow](git-workflow.md), [Application architecture](../architecture/application-architecture.md)

These standards apply to every workspace. ESLint and Prettier enforce most of them automatically. Reviewers enforce the rest.

## 1. TypeScript

- `strict: true` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables` (all in `packages/config/tsconfig/base.json`).
- **No `any`.** Use `unknown` and narrow it. If `any` is truly unavoidable (e.g. an untyped third-party callback), use `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <reason>`.
- No non-null assertions (`!`) except in tests. Narrow instead.
- No TS `enum`. Use `as const` arrays + union types from `@garba-partner/shared`.
- Prefer `type` for unions and compositions. Use `interface` for object shapes that are extended.
- Explicit return types on exported functions and service methods.
- `import type` for type-only imports (`@typescript-eslint/consistent-type-imports`).
- ESM everywhere. Relative imports inside a package. Package imports across workspaces (`@garba-partner/shared`). No deep imports into another package's `src/`.

## 2. Naming

| Thing | Convention | Example |
|---|---|---|
| Files (non-component) | kebab-case + role suffix | `interest.service.ts`, `require-member.ts`, `discovery.queries.ts` |
| React components | PascalCase file = component | `ReportDialog.tsx` |
| Hooks | `use` + camelCase | `useChatMessages.ts` |
| Sequelize models | PascalCase singular, `.model.ts` | `ProfilePhoto.model.ts` → table `profile_photos` |
| Variables / functions | camelCase, verbs for functions | `assertCanInteract`, `buildImageUrl` |
| Constants | UPPER_SNAKE_CASE | `LIMITS.INTERESTS_PER_DAY` |
| Types / interfaces | PascalCase, no `I` prefix | `PublicProfileDto` |
| DB tables / columns | snake_case, plural tables | `event_attendances.looking_for_partner` |
| API JSON fields | camelCase | `lookingForPartner` |
| API paths | kebab-case, plural resource nouns, versioned | `/api/v1/matches/:matchId/messages` (the [endpoint catalogue](../architecture/application-architecture.md#5-api-endpoint-catalogue) is canonical) |
| Socket events | `domain:action` | `message:send`, `match:ended` |
| Env vars | UPPER_SNAKE_CASE, `VITE_` only for public client vars | `JWT_ACCESS_SECRET` |
| Booleans | `is/has/can/should` prefix in code | `isVerified`, `canInteract` |

## 3. Formatting and linting

- **Prettier** (shared config): 2 spaces, single quotes, semicolons, trailing commas `all`, print width 100.
- **ESLint** flat config (shared): `typescript-eslint` (type-aware), `eslint-plugin-react`, `react-hooks`, `jsx-a11y` (web/admin), `import` (order, no cycles, restricted paths between workspaces).
- Required custom rules:
  - `react/no-danger` = error (no `dangerouslySetInnerHTML`).
  - `no-console` = error in `apps/api` (use the logger) and warn in frontends (strip in production builds).
  - `no-restricted-imports`: apps can't import from other apps; web/admin can't import `@garba-partner/config/server`.
  - `@typescript-eslint/no-floating-promises` = error.
- Lint and format checks run in CI. A PR with lint errors can't merge.

## 4. API (Express) standards

### 4.1 Module layout

Each domain module under `apps/api/src/modules/<domain>/` contains:

| File | Responsibility |
|---|---|
| `<domain>.routes.ts` | Router: path + middleware chain + controller. No logic |
| `<domain>.controller.ts` | Read `req.validated` + `req.auth`, call **one** service method, respond with `ok()`/`created()`. ≤ ~15 lines per handler |
| `<domain>.service.ts` | Business rules, authorization, transactions, orchestration |
| `<domain>.queries.ts` (optional) | Complex/reused SQL or Sequelize queries |
| `<domain>.mapper.ts` | Model → DTO mapping (allow-list) |
| `<domain>.test.ts` / `*.int.test.ts` | Unit / integration tests |

Validation schemas live in `@garba-partner/shared` (not in the module), so the frontend reuses them.

### 4.2 Controller example

```ts
// interests.controller.ts
export const sendInterest: RequestHandler = async (req, res) => {
  const input = req.validated.body as SendInterestInput;
  const result = await interestsService.send(req.auth.userId, input);
  return created(res, result, result.matched ? "It's a match!" : 'Interest sent');
};
```

### 4.3 Service example

```ts
// interests.service.ts
export async function send(senderId: string, input: SendInterestInput): Promise<SendInterestResult> {
  await safetyService.assertCanInteract(senderId, input.receiverId, { action: 'send_interest' });
  await assertDailyInterestLimit(senderId);

  const result = await sequelize.transaction(async (t) => {
    const reverse = await findPendingInterest(input.receiverId, senderId, t, { lock: true });
    if (reverse) return acceptIntoMatch(reverse, t); // mutual interest → match
    return createPendingInterest(senderId, input, t);
  });

  // side effects after commit are registered inside helpers via t.afterCommit
  return result;
}
```

(The example is illustrative. Follow the pattern, not the exact code.)

### 4.4 Errors

- Throw `AppError` with a shared `ERROR_CODES` value: `throw new AppError('USER_UNAVAILABLE')`. HTTP status and default message come from the code map.
- Never throw raw strings. Never `res.status(500).json(...)` inside controllers. The central `error-handler` formats every error.
- Express 5 forwards rejected promises from async handlers automatically. Don't wrap handlers in `try/catch` just to call `next(err)`.
- Wrap Sequelize unique-constraint errors in services into domain errors (`CONFLICT`) when they are expected.
- Error messages shown to users must not reveal blocks, declines, report outcomes or whether a phone number exists.

### 4.5 Database access

- Every model column declares an explicit `DataType` and `allowNull`. Models set `underscored: true`, `tableName`, `timestamps`.
- Services pass `transaction` explicitly to every query inside a transaction.
- Use `attributes: [...]` to select only needed columns on hot paths (discovery, chat lists).
- Avoid N+1 queries: use `include` with explicit attributes, or batch queries with `WHERE id IN (...)`.
- Raw SQL uses `replacements`/`bind` only. Never template strings with input.
- Paginate with keyset cursors (`lib/pagination.ts`), never `OFFSET` on user-facing lists.

### 4.6 Logging

- Use the injected `logger` (pino) with structured fields: `logger.info({ userId, matchId }, 'match created')`.
- **Never log**: OTPs, phone numbers, tokens, cookies, passwords, message bodies, DOB, selfie URLs. Log IDs instead.
- Levels: `error` (needs action), `warn` (suspicious or degraded), `info` (lifecycle/business events), `debug` (dev only).

### 4.7 Dates and money

- Store UTC `timestamptz`. Business-day calculations (age, "today's events", daily limits) use `Asia/Kolkata` explicitly via shared helpers.
- Use `date-fns` + `date-fns-tz` (or `Intl`). Avoid manual offset math.
- Money (post-MVP): integer **paise**, never floats.

## 5. Frontend standards (web & admin)

- Function components + hooks only. One component per file. Named exports (default exports only where tooling requires it, e.g. lazy route modules if needed).
- `pages/` compose features. `features/<domain>/` owns API hooks, components and domain logic. `components/ui` is presentational and domain-agnostic.
- **Server state belongs to TanStack Query.** Don't copy query data into `useState`. Use `select` and derived values.
- Query hooks live in `features/<domain>/api.ts`: `useEvents(params)`, `useSendInterest()`. Components never call `fetch` directly.
- Forms: react-hook-form + `zodResolver(sharedSchema)`. Map server `VALIDATION_ERROR.details` onto fields.
- Styling: Tailwind utility classes. Extract repeated patterns into components, not `@apply` soup. Theme tokens come from the shared theme. No hard-coded brand colours.
- Accessibility: semantic elements, `label` for every input, `alt` on images, visible focus, `aria-live` for chat updates and toasts, touch targets ≥ 44 px. `jsx-a11y` must pass.
- Never store access tokens or PII in `localStorage`/`sessionStorage`. Only non-sensitive UI preferences (e.g. last selected city ID).
- Never render user content as HTML. No auto-linking.
- Keep components under ~200 lines. Split when they grow.
- Copy about verification and safety must follow [product overview §7](../product/product-overview.md#7-safety-and-trust-positioning-mandatory-copy-rules).

## 6. Shared package standards

- Anything used by more than one app (types, enums, limits, schemas, error codes, socket contracts, pure helpers) **must** live in `packages/shared`.
- Shared code is pure and isomorphic: no Node built-ins, no DOM, no env access, no side effects on import.
- Changing a shared contract means updating every consumer in the same PR (typecheck enforces this).
- Every schema exports its inferred type. Every constant array exports its union type.

## 7. Testing

| Level | Tool | Scope | Location |
|---|---|---|---|
| Unit | Vitest | Pure logic: age calc, contact detection, eligibility helpers, mappers, token utils | `*.test.ts` next to code |
| API integration | Vitest + Supertest against a real PostgreSQL test DB (migrations applied, truncated per test file) | Routes → services → DB, including auth, authorization and safety rules | `*.int.test.ts` |
| Socket integration | Vitest + `socket.io-client` against an in-process server | Chat send/read, block/sanction disconnect | `apps/api/src/realtime/*.int.test.ts` |
| Frontend | Vitest + React Testing Library | Critical components: onboarding form, chat composer + nudge, report dialog, guards | `*.test.tsx` |
| E2E (Phase 6, optional) | Playwright | Signup → match → chat happy path, block path | `e2e/` (added only when approved) |

Rules:

- **Every business rule and every safety/authorization rule has a test.** At minimum: happy path, forbidden path (wrong user / IDOR), blocked path and suspended path.
- External providers (SMS, Cloudinary) are mocked via their interfaces. Tests never hit real services.
- Tests are deterministic: fake timers for expiry/cooldowns, and no reliance on test order.
- No real personal data in fixtures. Use obviously fake numbers (e.g. `+9199999000xx`) and generated names.
- Coverage is a signal, not a goal. Target ≥ 80% lines for `services/` in the API.

## 8. Comments and documentation

- Code explains *what*. Comments explain *why* (non-obvious business or security reasons), e.g. `// Return NOT_FOUND, not FORBIDDEN, so blocks aren't revealed.`
- No commented-out code. No TODO without an issue reference (`// TODO(#42): ...`).
- Public service functions get a one-line JSDoc when intent isn't obvious from the name.
- Feature documentation follows the template in [development rules §6](development-rules.md#6-feature-documentation-template).

## 9. Dependencies

- Prefer the platform and existing dependencies. Add a dependency only when it removes meaningful complexity or risk.
- Each new dependency needs a PR justification: purpose, alternatives considered, maintenance status, licence (MIT/Apache/BSD-style preferred), bundle size (frontend).
- Pin via `package-lock.json`. Use `npm ci` in CI and on servers.
- The approved baseline (expected at MVP) is listed in the table below. Anything else needs approval.

| Area | Packages |
|---|---|
| API | express, socket.io, sequelize, sequelize-typescript, pg, umzug, zod, jsonwebtoken, argon2, otplib, helmet, cors, cookie-parser, express-rate-limit, multer, sharp, cloudinary, pino, pino-http, libphonenumber-js, node-cron, date-fns, date-fns-tz |
| Web/Admin | react, react-dom, react-router, @tanstack/react-query, react-hook-form, @hookform/resolvers, socket.io-client, tailwindcss, date-fns |
| Shared | zod |
| Dev | typescript, vite, @vitejs/plugin-react, vitest, supertest, @testing-library/react, eslint + plugins, prettier, concurrently |
