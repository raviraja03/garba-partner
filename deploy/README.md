# deploy/

Production deployment files for Garba Partner (Linux VPS, Nginx, PM2, PostgreSQL). Nothing in this folder is used in local development, and nothing here contains a secret.

**Start with [docs/deployment/production-setup.md](../docs/deployment/production-setup.md).** It has the status (not deployed yet), the blockers, the step-by-step procedure and the deployment checklist.

| Path | What it is | Guide |
|---|---|---|
| `env/production.env.example` | Template for `/etc/garba-partner/production.env` (domains, settings, secrets as placeholders) | [production setup §4](../docs/deployment/production-setup.md#4-environment-file) |
| `nginx/` | Site templates and snippets; rendered with the domains from the env file | [nginx.md](../docs/deployment/nginx.md) |
| `postgres/setup-roles.sql` | Owner role + DML-only app role + database | [production setup §5](../docs/deployment/production-setup.md#5-postgresql) |
| `postgres/garba-partner.conf`, `pg_hba.conf.example` | Server settings (loopback, no statement logging) and access rules | same |
| `scripts/preflight.sh` | Read-only checks of the server, the env file and a built release | [production setup §7](../docs/deployment/production-setup.md#7-first-deploy) |
| `scripts/deploy.sh` | Build a release, back up, migrate, switch, restart, verify; rolls back if unhealthy | same |
| `scripts/healthcheck.sh` | Local and public health checks; a deployment is complete only when it passes | [production setup §8](../docs/deployment/production-setup.md#8-health-checks) |
| `scripts/rollback.sh` | Switch back to an earlier release (code only) | [rollback.md](../docs/deployment/rollback.md) |
| `scripts/backup-db.sh`, `restore-db.sh` | Encrypted database backup and restore | [database-backup.md](../docs/deployment/database-backup.md) |
| `scripts/render-nginx.sh` | Render the Nginx templates, test, reload | [nginx.md §3](../docs/deployment/nginx.md#3-rendering) |
| `scripts/lib.sh` | Helpers shared by the scripts (sourced, not run) | — |
| `logrotate/garba-partner` | Rotation of the API logs | [pm2.md §6](../docs/deployment/pm2.md#6-logs) |
| `cron/garba-partner` | Nightly backup schedule | [database-backup.md §3](../docs/deployment/database-backup.md#3-setup) |

The PM2 process file is [`ecosystem.config.cjs`](../ecosystem.config.cjs) at the repository root.

Run the scripts with `bash deploy/scripts/<name>.sh` (`--help` shows the usage). They read settings from the env file one key at a time and never execute it.
