# Logging

How the API logs requests, where to find the logs, and the two debugging switches.

## 1. What is logged

| What | Where it goes | Controlled by |
| --- | --- | --- |
| One line per API request (`[API]` / `[API ERROR]`) | Server log | `LOG_API_REQUESTS` (default `true`) |
| One row per API request | `api_logs` table | `LOG_API_TO_DATABASE` (default `true`) |
| One-time login codes (`[OTP]`) | Server log only | `LOG_OTP` (default `false`) |
| SMS / WhatsApp notification attempts (`[NOTIFICATION]`) | Server log and `notification_deliveries` | See [notification channels](../notifications/notification-channels.md) |

The logger is [pino](https://getpino.io) (already a dependency; no library was added). In development the output is pretty-printed; in production each line is JSON with the same text in `msg`, so `grep '\[API'` works on both.

## 2. API request logging

Implemented in `apps/api/src/middlewares/api-logger.ts` and mounted first in `apps/api/src/app.ts`, so every request passes through it, including ones that fail before reaching a route (bad JSON, unknown path, rate limit).

```text
[API] POST /api/v1/auth/send-otp | 200 | 80ms | requestId=1d451d4b-… | userId=-
[API] GET /api/v1/auth/me | 200 | 17ms | requestId=3cf9f202-… | userId=a1f0c3de-…
[API ERROR] GET /api/v1/auth/me | 401 | 2ms | requestId=4f11dd97-… | userId=- | error=Please log in to continue.
[API ERROR] GET /api/v1/cities | 500 | 12ms | requestId=… | userId=- | error=Error: Database connection failed
```

- **Request ID.** Generated per request (or taken from a well-formed `X-Request-Id` header, e.g. from Nginx) and returned in the `X-Request-Id` response header. Everything logged while handling the request carries it, so one ID finds the whole story. The web app shows it to the member when a request fails.
- **User ID.** The member's ID, `admin:<id>` for an admin request, or `-` when nobody is signed in.
- **Level.** `info` for 2xx/3xx, `warn` for 4xx, `error` for 5xx.
- **Error text.** For a 4xx it is the same message the client received. For a 5xx it is the real cause (`ErrorName: message`), with standalone digit runs and email addresses masked and cut to 300 characters. The client never sees it: it gets the generic message and the request ID.
- **Structured fields.** Each line also has `requestId`, `userId`, `adminId`, `durationMs` and `result` (`SUCCESS` / `FAILURE`) as JSON fields, for log tools that filter on keys.
- **Not logged:** `GET /api/v1/health` (uptime probes) and CORS preflights (`OPTIONS`).

### What is never logged

Request and response bodies, headers, cookies and query strings. They carry phone numbers, one-time codes, access tokens, passwords and chat text. The path is logged without its query string. In addition the logger redacts any field named `password`, `otp`, `code`, `token`, `accessToken`, `refreshToken`, `secret` or `phone`, and the `Authorization` and `Cookie` headers (`apps/api/src/lib/logger.ts`).

### The `api_logs` table

Migration `20261008100000-create-api-logs`. Same facts as the log line:

| Column | Notes |
| --- | --- |
| `id` | UUID |
| `request_id` | Indexed |
| `user_id`, `admin_id` | FK → `users` / `admin_users`, `SET NULL` on delete |
| `method`, `endpoint` | `endpoint` is the path only |
| `status_code`, `response_time_ms`, `success` | `success` = status below 400 |
| `ip_address` | `inet`. See the privacy note below |
| `user_agent` | Cut to 255 characters |
| `request_timestamp`, `response_timestamp`, `created_at` | |
| `error_code`, `error_message` | Error code (`VALIDATION_ERROR`, …) and the same text as the log line |

Indexes: `request_id`; `(user_id, created_at DESC)` where a user is set; `created_at`; `(status_code, created_at DESC)` for failures only; `(endpoint, created_at DESC)`.

**It does not slow requests down.** A request only pushes an entry onto an in-memory queue (`apps/api/src/modules/api-logs/api-log.store.ts`). One multi-row `INSERT` runs at most every 2 seconds, or sooner when 200 entries are waiting. If a write fails the batch is dropped and the failure is logged; if the database is down the queue is capped at 5,000 entries and the oldest are dropped. Requests are never delayed or failed by logging. On shutdown the queue is written before the database connection closes.

**Retention.** Rows older than `API_LOG_RETENTION_DAYS` (default 30) are deleted at start-up and then once a day.

**Privacy note.** Elsewhere the project stores client IPs only as HMACs (OTP limits, audit log). `api_logs.ip_address` holds the real address because that is what makes it useful for debugging. It is personal data: keep the retention short and do not expose this table outside the team.

Useful queries:

```sql
-- One request
SELECT * FROM api_logs WHERE request_id = '…';
-- Failures in the last hour
SELECT request_timestamp, method, endpoint, status_code, error_code, error_message
  FROM api_logs WHERE status_code >= 400 AND created_at > now() - interval '1 hour'
 ORDER BY created_at DESC;
-- What a member did
SELECT request_timestamp, method, endpoint, status_code FROM api_logs
 WHERE user_id = '…' ORDER BY created_at DESC LIMIT 50;
-- Slowest endpoints today
SELECT endpoint, count(*), round(avg(response_time_ms)) AS avg_ms, max(response_time_ms) AS max_ms
  FROM api_logs WHERE created_at > current_date GROUP BY endpoint ORDER BY avg_ms DESC LIMIT 10;
```

## 3. OTP logging

```text
[OTP] LOGIN | mobile=+91XXXXXX0005 | OTP=123456 | expiresAt=2026-10-08T07:14:52.370Z | requestId=1d451d4b-…
```

Implemented in `apps/api/src/modules/auth/otp-log.ts`, called from `sendOtp` in `apps/api/src/modules/auth/auth.service.ts` right after the code is generated.

- **Off by default.** It prints only when `LOG_OTP=true`. Set it in the env file and restart the API; set it back to `false` (or remove the line) and restart to turn it off.
- When it is on, the API writes a warning at start-up saying so.
- The phone number is masked. The code appears only in this line: not in the `[API]` lines, not in `api_logs`, not in the API response.
- Nothing is printed for a banned number (no code is delivered to it either).

**Risk.** Anyone who can read the server log can sign in as the member whose code is printed, and PM2 keeps the log in files on disk. Use it to debug, then turn it off. This is a deliberate exception to the rule "never log OTPs" in `CLAUDE.md`; with `LOG_OTP=false` that rule holds everywhere.

**The development banner is separate.** With `SMS_PROVIDER=dev` (accepted only when `APP_ENV=development`) the send-otp response contains `devOtp` and the web app shows it on the code screen. That behaviour is unchanged and cannot be enabled in staging or production.

## 4. Reading the logs

| Where | Command |
| --- | --- |
| Development | The terminal running `npm run dev` |
| Production (PM2) | `pm2 logs gp-api --lines 200` |
| Only API lines | `pm2 logs gp-api --lines 1000 --nostream \| grep '\[API'` |
| Only failures | `pm2 logs gp-api --lines 1000 --nostream \| grep '\[API ERROR\]'` |
| One request | `pm2 logs gp-api --lines 5000 --nostream \| grep '<request id>'` |
| OTPs (when enabled) | `pm2 logs gp-api --lines 200 --nostream \| grep '\[OTP\]'` |
| Notifications | `pm2 logs gp-api --lines 1000 --nostream \| grep '\[NOTIFICATION\]'` |

## 5. Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOG_API_REQUESTS` | `true` | Write the `[API]` line for each request |
| `LOG_API_TO_DATABASE` | `true` | Store each request in `api_logs` |
| `API_LOG_RETENTION_DAYS` | `30` | Delete `api_logs` rows older than this (1–365) |
| `LOG_OTP` | `false` | Print one-time codes to the server log |
| `LOG_LEVEL` | `info` | Existing. `warn` hides successful `[API]` lines but keeps `[API ERROR]` and `[OTP]` |

## 6. Tests

`apps/api/src/middlewares/api-logging.int.test.ts` (needs `TEST_DATABASE_URL`) covers: successful GET and POST, 400, 401, 404, 500, member and admin requests, skipped health checks and preflights, both switches, a failing database write, batching and the queue cap, retention, and OTP logging on and off. `apps/api/src/lib/log-sanitize.test.ts` covers masking and the env rules.

## 7. Limitations

- Socket.IO events (live chat) are not HTTP requests and do not appear in `api_logs`.
- `api_logs` entries waiting in memory are lost if the process is killed without a clean shutdown (at most about 2 seconds of requests). The server log is not affected.
- There is no admin screen for `api_logs`; query the table directly.
