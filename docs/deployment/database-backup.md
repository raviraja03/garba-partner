# Database Backup and Restore

> Related: [Production setup](production-setup.md), [Rollback](rollback.md), [Migration guide](../database/migration-guide.md), [Incident response](../safety/incident-response.md)

## 1. Purpose

PostgreSQL holds everything that cannot be recreated: members, profiles, matches, messages, reports, the audit log, orders and bookings. This page defines how it is backed up, how a backup is restored and how to prove that it works.

Both scripts were tested against a local PostgreSQL 16 (see [production setup §12](production-setup.md#12-what-was-tested-and-what-was-not)). The off-site copy and the cron schedule have not run yet.

## 2. Strategy

| Topic | Decision |
|---|---|
| Method | Nightly logical dump: `pg_dump --format=custom` of the whole database, by [`backup-db.sh`](../../deploy/scripts/backup-db.sh) |
| Schedule | 21:15 UTC (02:45 IST) from [`/etc/cron.d/garba-partner`](../../deploy/cron/garba-partner); also automatically **before every deploy's migrations** |
| Verification | Every dump is listed with `pg_restore --list` before it counts; a SHA-256 checksum is written next to it |
| Encryption | GPG, to the public key `BACKUP_GPG_RECIPIENT`. The private key is **not** on the server, so someone who takes over the server cannot read old backups. An unencrypted backup is refused unless `--allow-unencrypted` is given |
| Local retention | `BACKUP_RETENTION_DAYS` (14) in `BACKUP_DIR` (`/var/backups/garba-partner`, mode `700`) |
| Off-site copy | `rclone copy` to `BACKUP_RCLONE_REMOTE` (any S3-compatible or similar storage, in another region/provider than the VPS). Retention there by lifecycle rules: 7 daily, 4 weekly, 3 monthly |
| Recovery point | Up to 24 hours of data can be lost (time since the last dump). Shorter needs WAL archiving or a managed database |
| Recovery time | About an hour for a new server at the current size: install, restore, deploy, DNS |
| Restore drill | Every quarter, and after any change to the backup setup (§5) |

**What a database backup does not contain**

| Item | Where it lives | How it is protected |
|---|---|---|
| `PHONE_HASH_SECRET`, `PHONE_ENCRYPTION_KEY` and the other secrets | `/etc/garba-partner/production.env` | Copy in the password manager. **Without the two phone keys a restored database is unusable**: members cannot sign in and phone numbers cannot be decrypted |
| Profile and event images | Cloudinary | Cloudinary's own storage. Deleted images are gone on purpose (privacy) |
| The GPG private key | Offline, with two named people | Without it no encrypted backup can be restored |
| Code and configuration templates | Git | — |

Backups contain personal data (encrypted phone numbers, messages, reports). They are encrypted, kept only as long as the retention above, and deleted with the same care as the database. A member's deletion request is complete only when the last backup containing their data has expired: say so in the privacy policy.

## 3. Setup

```bash
# 1. On a trusted computer (not the server): create the backup key pair, export the PUBLIC key
gpg --quick-gen-key "Garba Partner backups <backups@garbamates.in>" default default never
gpg --armor --export backups@garbamates.in > gp-backup-public.asc
# Store the private key offline (password manager / hardware token), with a second person.

# 2. On the server, as the deploy user: import the public key only
sudo -iu garba gpg --import gp-backup-public.asc

# 3. Env file: BACKUP_GPG_RECIPIENT=backups@garbamates.in and BACKUP_RCLONE_REMOTE=<remote>:<path>
#    Configure the remote once:  sudo -iu garba rclone config

# 4. First run by hand, then install the schedule
sudo -iu garba bash /srv/garba-partner/current/deploy/scripts/backup-db.sh --label manual
sudo cp /srv/garba-partner/repo/deploy/cron/garba-partner /etc/cron.d/garba-partner && sudo chmod 644 /etc/cron.d/garba-partner
```

Give the storage credentials used by `rclone` write-only (append) rights if the provider supports it, so a compromised server cannot delete existing backups.

The script connects as the owner role (`DATABASE_MIGRATION_URL`) and passes the connection through `PG*` environment variables, so the password never appears in the process list.

## 4. Running and monitoring

```bash
sudo -iu garba bash /srv/garba-partner/current/deploy/scripts/backup-db.sh [--label NAME]
```

Result: `garba_partner-<UTC time>[-label].dump.gpg` and `.sha256` in `BACKUP_DIR`; the last output line is the file path. The script exits non-zero if the dump, the verification, the encryption **or the off-site copy** fails; a failed encryption leaves no partial file.

Monitor: the nightly run appends to `/var/log/garba-partner/backup.log`. Alert on a line containing `ERROR`, and on "no new file in the off-site storage for 26 hours" (this also catches a cron that silently stopped).

## 5. Restore drill

Proves that a backup can be read, decrypted and loaded. Do it on a machine that holds the private key: the server only temporarily, or better a separate one.

```bash
# An empty database owned by the owner role
sudo -u postgres createdb -O gp_owner garba_partner_restore

sudo -iu garba bash /srv/garba-partner/current/deploy/scripts/restore-db.sh \
  /var/backups/garba-partner/garba_partner-<time>.dump.gpg --dbname garba_partner_restore
```

[`restore-db.sh`](../../deploy/scripts/restore-db.sh) verifies the checksum, decrypts, restores in one transaction and prints the latest migration and row counts. Compare them with production. Then drop the copy: `sudo -u postgres dropdb garba_partner_restore`, and remove the private key from the server if you imported it.

Record the date, the backup used, the time it took and who did it. A drill that fails is a production incident: fix it before the next deploy.

To open the restored copy with the app role (for example to run a staging API on it), grant that role its rights there, because they are set per database:

```bash
sudo -u postgres psql -v db=garba_partner_restore -v owner=gp_owner -v app=gp_app -f deploy/postgres/setup-roles.sql
```

## 6. Disaster recovery

**A. Data was damaged, the server is fine** (bad migration, mistaken bulk change)

1. Stop the API so nothing else is written: `pm2 stop gp-api`.
2. Take a backup of the damaged state first (`backup-db.sh --label damaged`): it may be needed to recover rows created after the last good backup.
3. Restore the last good backup into a **drill database** (§5) and check it.
4. Restore over production:

   ```bash
   sudo -iu garba bash /srv/garba-partner/current/deploy/scripts/restore-db.sh <backup file> \
     --dbname garba_partner --overwrite-production
   ```

   The script refuses while the API is online, and asks you to type the database name.
5. If the restored schema is older than the live code, deploy the matching release or run the migrations: `cd /srv/garba-partner/current && NODE_ENV=production npm run db:migrate:prod -w @garba-partner/api`.
6. Start the API (`pm2 start gp-api`) and run `healthcheck.sh`.
7. Everything written between the backup and the restore is lost. Tell affected members if needed, and reconcile payments made in that window with the Razorpay dashboard ([refunds](../payments/refunds.md)).

**B. The server is lost**

1. New VPS: [production setup §3–§6](production-setup.md#3-prepare-the-server), with the **same secrets** from the password manager in the env file.
2. `setup-roles.sql` (creates the roles and the empty database), set the passwords.
3. Fetch the newest backup from the off-site storage, import the private key temporarily, restore with `--dbname garba_partner --overwrite-production` (the API is not running yet).
4. `deploy.sh` with the release that was live (its migrations bring the schema up to date if needed).
5. Point DNS at the new server, issue certificates ([ssl.md](ssl.md)), run `healthcheck.sh`.

Members' sessions survive a restore only if the session rows were in the backup; anyone signed in after it must sign in again.

## 7. Troubleshooting

| Message | Meaning |
|---|---|
| "BACKUP_GPG_RECIPIENT is empty: refusing…" | Set the recipient (§3). `--allow-unencrypted` is for test servers only |
| gpg: "No public key" / "skipped: unusable public key" | The public key is not imported for the deploy user, or the recipient is misspelt |
| "the dump failed verification" | `pg_dump` wrote a damaged file (disk full?). Check `df -h` |
| "backup finished locally, but the off-site copy failed" | The local file exists. Check `rclone` credentials and network, then copy by hand |
| "checksum mismatch: the backup file is damaged" | Do not restore it. Use another copy (off-site) or an older backup |
| "…is the production database" | Intended protection. Restore into a drill database, or follow §6 |
| `pg_restore: error: … permission denied` | The target database is not owned by the owner role |
