# Git Workflow — Garba Partner

> Related: [Development rules](development-rules.md), [Coding standards](coding-standards.md)

## 1. Model

**Trunk-based development with short-lived branches.**

- `main` is always deployable and **protected**.
- All work happens on short-lived branches (ideally < 3 days) merged through pull requests.
- Releases are **tags** on `main` (`vX.Y.Z`). No long-lived `develop` or release branches in the MVP.

## 2. Branch protection (`main`)

- Direct pushes are blocked (including for admins, except in emergencies with a written reason).
- Require a PR with ≥ 1 approving review. Changes touching `modules/auth`, `modules/safety`, `modules/admin`, `middlewares/require-*`, `lib/crypto.ts`, migrations or `security-architecture.md` need a review from a designated security owner (`CODEOWNERS`).
- Require passing CI: `typecheck`, `lint`, `format:check`, `test`, `build`.
- Require the branch to be up to date with `main` before merging.
- Squash merge only. Linear history.
- Force-pushing to `main` is disabled.

## 3. Branch naming

```text
<type>/<short-kebab-description>
```

| Type | Use |
|---|---|
| `feat/` | New feature (`feat/otp-login`, `feat/event-discovery`) |
| `fix/` | Bug fix (`fix/interest-expiry-timezone`) |
| `chore/` | Tooling, deps, config (`chore/eslint-shared-config`) |
| `docs/` | Documentation only (`docs/database-architecture`) |
| `refactor/` | Behaviour-preserving change |
| `test/` | Tests only |
| `hotfix/` | Urgent production fix branched from the latest release tag |

Optionally include the issue number: `feat/42-photo-upload`.

## 4. Commits: Conventional Commits

```text
<type>(<scope>): <imperative summary, ≤ 72 chars>

<body: what and why, wrapped at 100>

<footer: Refs #42, BREAKING CHANGE: ...>
```

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Scopes: `web`, `admin`, `api`, `shared`, `config`, `db`, `auth`, `profile`, `events`, `discovery`, `interests`, `chat`, `safety`, `docs`, `deploy`.
- Examples:
  - `feat(auth): add OTP request endpoint with DB-backed rate limits`
  - `fix(chat): reject messages when either participant is suspended`
  - `feat(db): add interests table with partial unique pending index`
- The squash-merge commit title = the PR title, which must also follow this format.
- Optional local enforcement: commitlint + a git hook (add only if the team wants it).

## 5. Pull requests

### 5.1 Size and scope

- One logical change per PR. Aim for < 400 changed lines excluding generated files and lockfiles.
- Don't mix refactors with behaviour changes.
- **No unrelated file changes** (CLAUDE.md rule). Formatting churn in untouched files isn't allowed.

### 5.2 PR template (`.github/pull_request_template.md`, added in Phase 0)

```markdown
## What
<!-- Summary of the change -->

## Why
<!-- Link to issue / MVP scope item -->

## How
<!-- Key implementation notes -->

## Database changes
- [ ] None
- [ ] Migration(s): <names> — `down` tested — docs/architecture/database-architecture.md updated

## API changes
<!-- New/changed endpoints or socket events; docs updated? -->

## Security & safety checklist
- [ ] Input validated with shared Zod schema (strict)
- [ ] Authorization: requireMember/requireAdmin(permission) + ownership/participant checks
- [ ] Interaction gate (blocks/suspension) applied where one user affects another
- [ ] No private data (phone, DOB, exact location, attendance) in responses/logs
- [ ] Rate limiting considered for new sensitive endpoints
- [ ] No secrets committed; new env vars added to .env.example + config schema

## Tests
<!-- What was added; how to run. Do not claim tests that were not run. -->

## Screenshots (UI)

## Docs updated
- [ ] Relevant docs/ files
- [ ] README (if needed)
```

### 5.3 Review guidelines

Reviewers check, in this order:

1. **Safety/security**: authorization, block/suspension enforcement, data exposure, input validation.
2. **Correctness**: business rules match [user flows](../product/user-flows.md), plus edge cases and transactions.
3. **Tests**: rules covered (happy, forbidden, blocked, suspended).
4. **Design**: layering (thin controllers, services own logic), shared types reused, no premature abstraction.
5. **Readability**: naming and standards.

Use `blocking:` / `nit:` / `question:` prefixes in review comments.

## 6. Database migrations in Git

- Migrations are committed together with the model and code changes that need them.
- **Never modify a migration that has been merged to `main`.** Write a new one.
- If two PRs create migrations, the second to merge must rebase and check the timestamp ordering still makes sense.
- Destructive migrations (drop column/table) need the expand → contract sequence across at least two releases and explicit approval in the PR.

## 7. Releases and deployment

1. Merge PRs into `main`. CI must be green.
2. Create an annotated tag with a changelog summary: `git tag -a v0.3.0 -m "Phase 3: discovery, interests, matches, safety core"`.
3. Versioning (SemVer-ish for the product): `0.x` until public launch. `MINOR` for phases/features, `PATCH` for fixes. `v1.0.0` at public launch.
4. Deploy the tag following [system architecture §4.5](../architecture/system-architecture.md#45-deployment-process-mvp).
5. Keep the `CHANGELOG.md` (added in Phase 0) up to date. Generating it from Conventional Commits is optional.

**Deploy freeze:** during Navratri nights (18:00–01:00 IST) only hotfixes are allowed.

## 8. Hotfixes

1. Branch `hotfix/<desc>` from the deployed tag (or `main` if it's identical).
2. Minimal fix + test. Expedited review (1 reviewer, security owner if applicable).
3. Merge to `main`, tag a `PATCH` release and deploy.
4. Write a post-incident note if user-facing.

## 9. Secrets and sensitive data in Git

- `.env` is git-ignored and **never committed**. Only `.env.example` with placeholders is committed.
- Enable GitHub secret scanning and push protection. Optionally run `gitleaks` in CI.
- Never commit real phone numbers, user photos, production dumps, or screenshots containing real user data.
- If a secret is committed: **rotate it immediately** (rotation matters more than rewriting history), then clean the history if needed, and record it as a security incident.

## 10. CI (GitHub Actions, added in Phase 0)

Workflow `ci.yml` on `pull_request` and `push` to `main`:

1. Checkout, set up Node 22 (the `.nvmrc` version) with npm cache.
2. `npm ci`
3. `npm run format:check`
4. `npm run lint`
5. `npm run typecheck`
6. Start a PostgreSQL service container → `npm run test` (the API integration tests run migrations against it)
7. `npm run build`
8. `npm audit --audit-level=high` (non-blocking warning at first, blocking before launch)

Dependabot: weekly npm updates, grouped for minor/patch versions. Security updates are always opened.
