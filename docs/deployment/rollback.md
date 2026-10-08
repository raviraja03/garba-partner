# Rollback

> Related: [Production setup](production-setup.md), [Database backup](database-backup.md), [PM2](pm2.md), [Migration guide](../database/migration-guide.md), [Incident response](../safety/incident-response.md)

## 1. Purpose

How to get back to a working state after a bad deploy: what can be undone in seconds, what needs care, and what cannot be undone at all.

`rollback.sh` was tested for its release selection and symlink switch on Linux bash. A full rollback on a server with PM2 has **not** been run yet: rehearse it once before launch (§6).

## 2. What a rollback covers

| Layer | Rolled back by | Speed | Notes |
|---|---|---|---|
| API code | `rollback.sh` (switch `current`, restart) | Seconds | The previous 5 releases stay on disk, already built |
| Web and admin apps | The same switch: Nginx serves `current/apps/*/dist` | Immediate | Open tabs keep the newer code until reloaded |
| Database schema | **Not** by `rollback.sh` | Manual | See §4 |
| Database data | Restore from backup | An hour, with data loss | Last resort: [database backup §6](database-backup.md#6-disaster-recovery) |
| Env file | Copy the dated previous file back, restart | Seconds | Keep a copy before every edit |
| Nginx configuration | `garba-partner.conf.previous`, or render again from the older release | Seconds | §5 |
| SMS sent, payments captured, refunds issued, images deleted | Cannot be rolled back | — | Handle as an incident |

## 3. Code rollback

**Automatic:** if the API is not healthy after `deploy.sh` switched to a new release, the script switches back to the previous release, restarts it and exits with an error. Migrations that already ran are **not** reverted.

**Manual**, as the deploy user:

```bash
sudo -iu garba
bash /srv/garba-partner/current/deploy/scripts/rollback.sh --list      # releases; * marks the live one
bash /srv/garba-partner/current/deploy/scripts/rollback.sh             # the release before the live one
bash /srv/garba-partner/current/deploy/scripts/rollback.sh 20261005101500-1a2b3c4d5e6f
bash /srv/garba-partner/current/deploy/scripts/healthcheck.sh          # full check afterwards
```

The script switches the `current` symlink atomically, restarts the API through PM2, waits for the health endpoint and runs the local health check. It never touches the database.

A release directory holds its own `.env` symlink to the **current** env file. If the bad deploy came with an env change, undo that too.

To go forward again, run `rollback.sh` with the newer release ID, or deploy a fixed version.

## 4. Database migrations

A code rollback only works if the **older code can run against the newer schema**. That is a rule for writing migrations, not something a script can repair afterwards:

| Change | Safe to roll the code back? | How to release it |
|---|---|---|
| Add a table, a nullable column, an index | Yes | One release |
| Add a `NOT NULL` column | Only with a default | Add with a default, or nullable first |
| Rename or drop a column or table, tighten a constraint | **No**: the old code still uses the old shape | **Expand → migrate → contract** over two releases: first add the new shape and make the code work with both; drop the old shape in a later release, once the previous one will never be rolled back to |
| Change the meaning of existing data | **No** | Same, plus a backup you have checked |

When a migration itself is the problem and must be reverted:

```bash
# 1. A backup of the current state (deploy.sh already made one named pre-<release> before migrating)
bash /srv/garba-partner/current/deploy/scripts/backup-db.sh --label before-undo

# 2. Undo the LAST migration, using the release that CONTAINS it (the newer one: the older
#    release does not have the migration file)
cd /srv/garba-partner/releases/<newer release>
NODE_ENV=production node apps/api/dist/scripts/db.js migrate:undo --confirm-production
NODE_ENV=production node apps/api/dist/scripts/db.js migrate:status

# 3. Roll the code back
bash /srv/garba-partner/current/deploy/scripts/rollback.sh
```

`migrate:undo` reverts one migration per run and refuses to run in production without `--confirm-production`. Read the migration's `down` first: some are lossy by nature (dropping a column drops its data).

If neither the old nor the new code can run against the database, restore the `pre-<release>` backup ([database backup §6A](database-backup.md#6-disaster-recovery)). Everything written since that backup is lost, so this is a decision for the person on call, not a default.

## 5. Nginx and TLS

- A failed `nginx -t` in `render-nginx.sh` changes nothing: the previous file is restored automatically.
- A rendered configuration that passes the test but misbehaves: `sudo cp /etc/nginx/conf.d/garba-partner.conf.previous /etc/nginx/conf.d/garba-partner.conf && sudo nginx -t && sudo systemctl reload nginx`. Then fix the template and render again from the corrected release.
- Certificates: certbot keeps earlier versions in `/etc/letsencrypt/archive/`. A failed renewal leaves the current certificate in place.
- HSTS cannot be rolled back: browsers that have seen it will not use plain HTTP for that domain for a year.

## 6. Rehearsal

Before launch, on the server and before real members exist:

1. Deploy a release, then deploy a second one (a commit that only changes a version string is enough).
2. `rollback.sh` → `healthcheck.sh` passes and the app shows the first version again.
3. `rollback.sh <second release>` → back to the second.
4. Break a release on purpose in a test branch (for example make the API exit at start) and deploy it: `deploy.sh` must restore the previous release by itself and exit with an error.
5. Note how long each step took.

Tick the rehearsal in the [deployment checklist](production-setup.md#11-deployment-checklist).

## 7. Decision guide

| Situation | Action |
|---|---|
| The API does not start or the health check fails right after a deploy | Nothing: `deploy.sh` already rolled back. Read `pm2 logs gp-api`, fix, deploy again |
| The deploy succeeded, a feature is broken, no migration in the release | `rollback.sh` |
| The same, and the release had only additive migrations | `rollback.sh` (the old code ignores the new tables and columns) |
| The release had a migration the old code cannot work with | Fix forward with a new release if possible; otherwise §4 |
| Data was changed wrongly | Stop the API, then [database backup §6A](database-backup.md#6-disaster-recovery) |
| A secret leaked | Not a rollback: rotate it, restart, and follow [incident response](../safety/incident-response.md) |
| Only the web or admin app is broken | `rollback.sh` (it switches all three together), then deploy a fix |

After any rollback: write down what happened, which release is live, and whether the database differs from what that release expects.
