# Project Structure

> Related: [Application architecture](../architecture/application-architecture.md), [Local development](local-development.md), [Coding standards](../development/coding-standards.md)

Garba Partner is an **npm workspaces** monorepo. This page describes what exists **now** (foundation + database layer). The target structure for later phases is in [application architecture](../architecture/application-architecture.md).

## 1. Tree

```text
garba-partner/
├── apps/
│   ├── api/                         @garba-partner/api — Express 5 REST API
│   │   ├── src/
│   │   │   ├── server.ts            HTTP bootstrap, env loading, DB connection, graceful shutdown
│   │   │   ├── app.ts               createApp(): middleware pipeline, injected dependencies (used by server + tests)
│   │   │   ├── routes.ts            /api/v1 router
│   │   │   ├── app.test.ts          Vitest + Supertest tests
│   │   │   ├── config/
│   │   │   │   ├── env.ts           loads root .env via @garba-partner/config/server
│   │   │   │   ├── database.ts      Sequelize instance (sequelize-typescript), pingDatabase()
│   │   │   │   └── umzug.ts         migration + seeder runners
│   │   │   ├── models/              User, UserProfile, UserPreference, UserSession, UserVerification (+ integration tests)
│   │   │   ├── migrations/          timestamped, transactional SQL migrations
│   │   │   ├── seeders/             development seed data
│   │   │   ├── scripts/db.ts        db CLI (migrate, undo, status, seed, reset)
│   │   │   ├── lib/                 app-error, response, logger, request-id, crypto, passwords, cookies, validation, pagination (cursor + sortable keyset), sql, pii-guards, migration-helpers
│   │   │   ├── middlewares/         authenticate, authorize, csrf, rate-limit, not-found, error-handler
│   │   │   ├── modules/
│   │   │   │   ├── health/          GET /api/v1/health (API + database)
│   │   │   │   ├── auth/            member OTP auth: routes, controller, service, otp.service, token.service
│   │   │   │   ├── profiles/        own profile, preferences, image upload, public profile (allow-list mappers)
│   │   │   │   ├── locations/       cities and areas (reference data)
│   │   │   │   ├── events/          public event list/detail, event mappers, slug
│   │   │   │   └── admin/           auth/ (login…), users/ (list, detail, suspend/reactivate), events/, organizers/, audit/ (audit log)
│   │   │   ├── providers/sms/       SmsProvider interface + development provider
│   │   │   ├── providers/media/     MediaStorage: Cloudinary + local (development only)
│   │   │   ├── scripts/             db.ts (db CLI), create-admin.ts
│   │   │   ├── test/                test helpers + global setup (migrates the test DB once)
│   │   │   └── types/express.d.ts   req.auth / req.admin typings
│   │   ├── tsconfig.json            type-check config (src + tests, no emit)
│   │   ├── tsconfig.build.json      build config (src → dist, tests excluded)
│   │   └── vitest.config.ts
│   ├── web/                         @garba-partner/web — member SPA (React 19 + Vite + Tailwind v4)
│   │   ├── index.html
│   │   ├── public/                  static assets (favicon)
│   │   ├── src/
│   │   │   ├── main.tsx             React root
│   │   │   ├── App.tsx              router (public-only login routes, protected routes)
│   │   │   ├── pages/               Login, VerifyOtp, Onboarding, Home, Profile, EditProfile, Preferences, NotFound
│   │   │   ├── components/          AuthLayout, ApiStatus, FullPageSpinner, ui/ (Button, Alert)
│   │   │   ├── features/auth/       AuthProvider, auth context, guards, auth API calls
│   │   │   ├── features/profile/    profile API + TanStack Query hooks, ProfileForm, ImageUpload, PreferencesForm, ProfileCard
│   │   │   ├── features/system/     useApiHealth hook
│   │   │   ├── lib/                 env (validated VITE_* vars), api-client (in-memory token, silent refresh)
│   │   │   └── styles/index.css     Tailwind + shared theme tokens
│   │   ├── tsconfig.json            references tsconfig.app.json (browser) + tsconfig.node.json (vite.config)
│   │   └── vite.config.ts           envDir = repo root, /api proxy, port 5173
│   └── admin/                       @garba-partner/admin — admin SPA (same stack as web, port 5174): login, dashboard, users list/detail
├── packages/
│   ├── config/                      @garba-partner/config — shared configuration
│   │   ├── src/server/              loadServerEnv() — Node only
│   │   ├── src/client/              loadClientEnv() — browser-safe (zod/mini)
│   │   ├── tsconfig/                base, node, library, react, vite-node presets
│   │   ├── eslint/index.js          createEslintConfig() — shared flat config
│   │   ├── prettier/index.json      Prettier config
│   │   └── tailwind/theme.css       Tailwind v4 @theme design tokens
│   └── shared/                      @garba-partner/shared — isomorphic contracts
│       └── src/
│           ├── constants/app.ts     APP_NAME, API_PREFIX, ADMIN_API_PREFIX, REQUEST_ID_HEADER
│           ├── constants/enums.ts   domain enumerations (statuses, genders, verification types, ...)
│           ├── constants/limits.ts  LIMITS (ages, name/bio lengths, OTP/session/admin-login limits)
│           ├── constants/auth.ts    cookie names, CSRF header
│           ├── constants/admin.ts   ADMIN_ROLES, ADMIN_PERMISSIONS, ROLE_PERMISSIONS
│           ├── schemas/             zod/mini request schemas (auth, profile, admin users)
│           ├── utils/phone.ts       normalizeIndianMobile, maskPhone
│           ├── utils/dates.ts       IST today, age, available-date rules
│           ├── utils/profile-completion.ts  completion % and profile status
│           ├── utils/text.ts        contact-detail detection, text normalisation
│           ├── errors/error-codes.ts ERROR_CODES (+ HTTP status, default message)
│           └── types/               ApiResponse envelope types, HealthDto
├── docs/                            product, architecture, development, setup docs
├── .editorconfig  .gitattributes  .gitignore  .nvmrc  .prettierignore
├── .env.example                     documented env template (committed)
├── .env                             local env (git-ignored, never committed)
├── eslint.config.js                 uses @garba-partner/config/eslint
├── package.json                     workspaces + root scripts
├── tsconfig.json                    solution file (references all workspaces, for editors)
└── README.md
```

## 2. Workspaces and dependencies

| Workspace | Depends on | Consumed by |
|---|---|---|
| `@garba-partner/config` | zod, ESLint plugins | all workspaces (tsconfig presets, ESLint, Prettier), api (`/server`), web + admin (`/client`, `/tailwind/theme.css`) |
| `@garba-partner/shared` | zod (`zod/mini` API) | api, web, admin |
| `@garba-partner/api` | config, shared, express, helmet, cors, cookie-parser, express-rate-limit, multer, sharp, cloudinary, pino, sequelize, sequelize-typescript, pg, umzug, reflect-metadata, jose, @node-rs/argon2 | — |
| `@garba-partner/web` | config, shared, react, react-router, @tanstack/react-query | — |
| `@garba-partner/admin` | config, shared, react, react-router, @tanstack/react-query | — |

Rules (enforced by ESLint `no-restricted-imports`):

- Apps never import other apps.
- Packages are imported only through their public entry points (`@garba-partner/shared`, `@garba-partner/config/client`, …), never `…/src/…` or `…/dist/…`.
- Browser code never imports `@garba-partner/config/server`.
- `packages/shared` never imports Node built-ins (it's bundled into browsers).

## 3. How packages are built and resolved

- `packages/config` and `packages/shared` compile with `tsc -b` to `dist/` (ESM + `.d.ts` + source maps). Their `package.json#exports` point at `dist`.
- `npm install` runs the root `prepare` script, which builds both packages. `npm run dev` keeps them rebuilt with `tsc -b --watch`.
- npm links workspaces into `node_modules/@garba-partner/*`, so apps import them like any package. Vite serves them directly from `packages/*/dist`.
- Non-TS assets in `packages/config` (tsconfig presets, ESLint, Prettier, Tailwind theme) are used directly, with no build step.

## 4. TypeScript configuration

| Preset (`packages/config/tsconfig/`) | Used by | Key settings |
|---|---|---|
| `base.json` | all presets | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnused*`, `verbatimModuleSyntax`, `isolatedModules`, ES2023, `types: []` |
| `node.json` | api, config | `module`/`moduleResolution: NodeNext`, `types: ["node"]` |
| `library.json` | shared | NodeNext, `composite`, declarations, **no Node types** (browser-safe) |
| `react.json` | web/admin `tsconfig.app.json` | `Bundler` resolution, `jsx: react-jsx`, DOM libs, `types: ["vite/client"]`, `noEmit` |
| `vite-node.json` | web/admin `tsconfig.node.json` | Bundler resolution + Node types for `vite.config.ts` |

TypeScript is pinned to `~6.0` because `typescript-eslint` doesn't support newer compilers yet.

Node-side code (api, packages) uses ESM with **explicit `.js` extensions** in relative imports (`import { ok } from './lib/response.js'`), as NodeNext requires. Frontend code uses extensionless imports (Bundler resolution).

`apps/api/tsconfig.json` additionally enables `experimentalDecorators` (sequelize-typescript) and sets `useDefineForClassFields: false`, so decorated model fields don't shadow Sequelize's attribute accessors. Every `@Column` declares its `DataType` explicitly, so `emitDecoratorMetadata` isn't needed. That keeps tsx (dev), Vitest and tsc (build) behaving the same.

## 5. Linting and formatting

- `eslint.config.js` (root) → `createEslintConfig()` from `packages/config/eslint/index.js`: `@eslint/js` recommended, `typescript-eslint` recommended + stylistic **type-checked**, React Hooks, React Refresh, jsx-a11y (frontends), Prettier compatibility. The project-specific safety rules are:
  - `no-console` is an error in the API. Use the logger.
  - `dangerouslySetInnerHTML` is banned in frontends.
  - `@typescript-eslint/no-explicit-any`, `no-floating-promises` and `no-non-null-assertion` are errors.
- ESLint is on v9 (maintenance line) because `eslint-plugin-jsx-a11y` doesn't support ESLint 10 yet. Upgrade once it does.
- Prettier config: `packages/config/prettier/index.json`, referenced from the root `package.json`. Markdown is excluded (docs tables are hand-formatted).

## 6. Where new code goes

| You are adding… | Put it in |
|---|---|
| A type, enum, constant, error code, DTO or Zod schema used by more than one app | `packages/shared/src/…` |
| A new environment variable | `packages/config/src/server/env.ts` or `src/client/index.ts` + `.env.example` + [environment-variables.md](environment-variables.md) |
| A new API domain (e.g. auth) | `apps/api/src/modules/<domain>/` with routes, controller, service; mount it in `routes.ts` |
| Web/admin UI for a domain | `apps/<app>/src/features/<domain>/`. Generic UI goes in `components/` |
