# Local Development

> Related: [Environment variables](environment-variables.md), [Project structure](project-structure.md), [Development rules](../development/development-rules.md)

This guide gets the Garba Partner monorepo running on your machine: the API, the member web app and the admin panel.

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | **22.12 or newer** (22 LTS or 24 LTS). `.nvmrc` pins 22 | `node -v` |
| npm | 10 or newer (ships with Node) | `npm -v` |
| Git | any recent version | `git --version` |
| PostgreSQL | **16 or newer**, listening on `127.0.0.1:5432` | `psql --version` |

Not needed yet: Cloudinary and an SMS provider. They come in with the phases that use them.

> **Windows:** the repo uses LF line endings (`.gitattributes`). Any editor works. Git Bash, PowerShell and cmd can all run the npm scripts.

## 2. First-time setup

```bash
git clone <repo-url> garba-partner
cd garba-partner

# 1. Install all workspaces (also builds packages/config and packages/shared via the `prepare` script)
npm install

# 2. Create your local environment file (git-ignored — never commit it)
cp .env.example .env          # PowerShell: Copy-Item .env.example .env

# 3. Create the database role + databases and fill DATABASE_URL, TEST_DATABASE_URL,
#    PHONE_HASH_SECRET and PHONE_ENCRYPTION_KEY in .env
#    → docs/database/database-setup.md

# 4. Create the schema and load fictional development data
npm run db:migrate
npm run db:seed
```

Everything else in `.env.example` works as-is for local development. See [environment-variables.md](environment-variables.md) before changing anything.

## 3. Running the apps

### Everything at once

```bash
npm run dev
```

This runs four processes (via `concurrently`):

| Name | What | URL |
|---|---|---|
| `packages` | `tsc -b --watch` for `packages/config` and `packages/shared` | — |
| `api` | Express API with `tsx watch` (restarts on change) | http://127.0.0.1:4000/api/v1/health |
| `web` | Vite dev server for the member app | http://localhost:5173 |
| `admin` | Vite dev server for the admin panel | http://localhost:5174 |

Both Vite dev servers **proxy `/api` to the API**, so the browser talks to one origin (the same setup as production behind Nginx). The page header shows **"API online"** when the proxy and the API are working.

Press `Ctrl+C` to stop everything.

### One app at a time

```bash
npm run dev:api
npm run dev:web
npm run dev:admin
```

Changes to `packages/shared` or `packages/config` need a rebuild before a single app picks them up. Either run `npm run dev:packages` in another terminal, or run `npm run build:packages` once.

### Check the API

```bash
curl http://127.0.0.1:4000/api/v1/health
# {"success":true,"message":"OK","data":{"status":"ok","database":"ok","timestamp":"..."}}
```

If PostgreSQL is down, the API keeps running and `/health` returns `503 SERVICE_UNAVAILABLE`.

### Database commands

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:migrate:undo` | Revert the last migration |
| `npm run db:migrate:status` | Show executed/pending migrations |
| `npm run db:seed` / `db:seed:undo` | Load / remove the fictional development users |
| `npm run db:reset` | Rebuild the development database from scratch (migrations + seeds) |

Details: [migration guide](../database/migration-guide.md).

## 4. Quality checks

Run these before every push. CI will run the same commands.

| Command | What it does |
|---|---|
| `npm run typecheck` | Builds the shared packages, then type-checks every workspace |
| `npm run lint` | ESLint (type-aware) across the whole repo |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run format:check` | Prettier check (Markdown is excluded on purpose) |
| `npm run format` | Prettier write |
| `npm run test` | Vitest (API unit tests + database integration tests when `TEST_DATABASE_URL` is set) |
| `npm run build` | Production build of every workspace |
| `npm run check` | All of the above, in order: format → lint → typecheck → test → build |

## 5. Production-like run (local)

```bash
npm run build
npm run start:api                  # node apps/api/dist/server.js
npm run preview:web                # http://localhost:4173 (serves apps/web/dist, proxies /api)
npm run preview:admin              # http://localhost:4174
```

To see production JSON logs instead of pretty logs, set `NODE_ENV=production` in the shell (for example `NODE_ENV=production npm run start:api` in Git Bash). **Don't** put `NODE_ENV` in `.env` (see [environment-variables.md](environment-variables.md#why-node_env-is-not-in-env)).

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Port 4000 is already in use` | Another API instance is running. Stop it or change `API_PORT` in `.env` (the Vite proxies follow `API_PORT` automatically) |
| Vite: `Port 5173 is already in use` | Ports are strict so the proxies and CORS origins stay predictable. Stop the other process |
| `Invalid server environment configuration: - API_PORT: ...` | A value in `.env` failed validation. The message names the variable (never its value) |
| `Cannot find module '@garba-partner/shared'` or stale types | Shared packages aren't built. Run `npm run build:packages` |
| Web page says "API offline — Unable to reach the server." | The API isn't running, or `API_HOST`/`API_PORT` don't match the running API |
| Production web bundle is unexpectedly large (~450 kB) | `NODE_ENV=development` got into `.env`. Remove it |
| ESLint: "file not found in any project" | New TS files must be inside a tsconfig `include` (e.g. `src/`) |
| Database errors (`password authentication failed`, `database does not exist`, `/health` 503, …) | See [database setup §5](../database/database-setup.md#5-troubleshooting) |

## 7. Editor setup (recommended)

- VS Code extensions: ESLint, Prettier, Tailwind CSS IntelliSense, EditorConfig.
- Enable "format on save" with Prettier as the default formatter for TS/TSX/JSON/CSS.
- Use the workspace TypeScript version (`node_modules/typescript`).
