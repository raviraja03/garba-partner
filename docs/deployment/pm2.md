# PM2

> Related: [Production setup](production-setup.md), [Rollback](rollback.md), [System architecture](../architecture/system-architecture.md)

## 1. Purpose

PM2 keeps the API process running: it starts it, restarts it if it crashes, restarts it after a reboot and collects its output. The process file is [`ecosystem.config.cjs`](../../ecosystem.config.cjs) at the repository root.

PM2 was **not available on the development machine**. What was tested there: the file loads, and the built API started with an IPC channel (as PM2 starts it) sends the `ready` signal and shuts down cleanly. The PM2 commands below are still to be confirmed on the server.

## 2. The process

| Setting | Value | Reason |
|---|---|---|
| `name` | `gp-api` | REST API, Socket.IO and the background jobs in one process |
| `exec_mode`, `instances` | `fork`, `1` | **Must stay one process**, see §3 |
| `cwd`, `script` | the release directory, `apps/api/dist/server.js` | PM2 loads the file through the `current` symlink and the path resolves to the real release, so a restart always runs the release it was started from |
| `env.NODE_ENV` | `production` | Set here and nowhere else (not in the env file) |
| `interpreter_args` | `--enable-source-maps` | Stack traces point at TypeScript lines |
| `wait_ready`, `listen_timeout` | `true`, 15 s | A start counts as successful only when the API calls `process.send('ready')` after it is listening |
| `kill_timeout` | 12 s | The API shuts down gracefully within 10 s (stops the jobs, closes sockets, finishes requests, closes the database pool); PM2 waits longer than that before killing |
| `max_memory_restart` | `512M` | Restart on a leak instead of swapping |
| `min_uptime`, `max_restarts`, `exp_backoff_restart_delay` | 10 s, 10, 200 ms | A crash loop slows down and then stops instead of spinning |
| `out_file`, `error_file` | `/var/log/garba-partner/api.{out,err}.log` | Rotated by `logrotate` ([production setup §10](production-setup.md#10-logging)). Override the directory with `GP_LOG_DIR` |

Secrets are **not** in this file. The API reads `<release>/.env`, a symlink created by the deploy script to `/etc/garba-partner/production.env`.

## 3. Why exactly one instance

Do not switch to cluster mode or raise `instances`:

- **Rate limits are in memory.** Two processes would each allow the full limit.
- **Background jobs run inside the API** (sanction expiry, event reminders, notification retention, payment reconciliation). Two processes would run each job twice.
- **Socket.IO** needs sticky sessions and a shared adapter across processes, or chat messages reach only some users.

Scaling beyond one process needs Redis for the limits and the Socket.IO adapter, and the jobs moved to a single worker. Until then, scale the VPS vertically.

The cost of one process: a restart interrupts the API for a few seconds. Chats reconnect on their own.

## 4. Commands

As the deploy user (`sudo -iu garba`):

| Task | Command |
|---|---|
| Start or restart from the live release | `pm2 startOrRestart /srv/garba-partner/current/ecosystem.config.cjs --update-env` |
| Status | `pm2 status` · `pm2 describe gp-api` |
| Logs | `pm2 logs gp-api --lines 200` |
| Restart after an env file change | `pm2 restart gp-api --update-env` |
| Stop (e.g. before restoring the database) | `pm2 stop gp-api` |
| Live CPU and memory | `pm2 monit` |
| Save the process list for reboots | `pm2 save` |

`deploy.sh` and `rollback.sh` run `startOrRestart` and `pm2 save` themselves.

## 5. Start on boot

Once, after the first deploy:

```bash
sudo -iu garba pm2 startup systemd -u garba --hp /home/garba   # prints a sudo command
# run the printed command as the admin user, then:
sudo -iu garba pm2 save
```

Verify with a reboot: `sudo reboot`, then `sudo -iu garba pm2 status` must show `gp-api` online and `healthcheck.sh --local` must pass. After upgrading Node.js, run `pm2 unstartup` and the two commands again.

## 6. Logs

PM2 writes the API's JSON log lines to the two files in §2 without adding its own timestamps (`time: false`; pino already has them). Rotation is done by `logrotate` with `copytruncate`, because PM2 keeps the files open:

```bash
sudo cp /srv/garba-partner/repo/deploy/logrotate/garba-partner /etc/logrotate.d/garba-partner
sudo logrotate --debug /etc/logrotate.d/garba-partner
```

`pm2-logrotate` is not used: one rotation mechanism for all logs on the server is simpler. PM2's own daemon log is `~garba/.pm2/pm2.log`.

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| `gp-api` is `errored` or restarts repeatedly | `pm2 logs gp-api --err --lines 100`. "Invalid server environment configuration" lists the variable names to fix in the env file |
| Start hangs for 15 s, then PM2 reports a failure | The API did not get as far as listening: port already in use, or the env validation failed |
| `/api/v1/health` returns `503` | The API runs but cannot reach PostgreSQL: `sudo systemctl status postgresql`, check `DATABASE_URL` |
| The old code still runs after a deploy | `pm2 describe gp-api` → "exec cwd" must be the new release. If not: `pm2 delete gp-api`, then `startOrRestart` |
| Not running after a reboot | §5 was skipped, or `pm2 save` was not run after the last change |
| Memory climbs until restart | Note the time and the `max_memory_restart` restarts in `pm2 describe`; investigate before raising the limit |
