# Release Checklist

> Related: [Testing strategy](testing-strategy.md), [Test cases](test-cases.md), [Security testing](security-testing.md), [Razorpay](../payments/razorpay.md), [Environment variables](../setup/environment-variables.md)

Tick every item before promoting a build to production. A release with an unchecked item needs a written, dated exception from the project owner.

## 1. Code and tests (every release)

- [ ] `main` is green: `npm run check` (format, lint, typecheck, unit + integration tests, builds) with `TEST_DATABASE_URL` set. **Integration suites must run, not be skipped.**
- [ ] The security suite passes: `npx vitest run src/security` (apps/api).
- [ ] New endpoints are in the unauthorized-access sweep lists ([testing strategy §6](testing-strategy.md#6-rules-for-new-code)).
- [ ] `npm audit --omit=dev`: no high or critical advisories; moderate ones reviewed against [accepted risks](security-testing.md#5-accepted-risks-and-follow-ups).
- [ ] Every feature in the release has docs updated (purpose, API, DB changes, security, tests), and the README roadmap/status is current.
- [ ] No secrets in the diff (`git diff` review; `.env` untracked; no `rzp_live_`, API secrets or passwords in code, tests or docs).

## 2. Database

- [ ] New migrations were tested **up → down → up** on a copy of the database.
- [ ] A **backup was taken** and a restore was tested within the last 30 days.
- [ ] Migrations run with `npm run db:migrate:prod` as the migration role; no ad-hoc SQL against production data.
- [ ] Seeders are **never** run outside development (the CLI refuses them).

## 3. Staging verification

Run on staging (test keys, test SMS) with the release build.

- [ ] Automated smoke: sign in (OTP), create a profile with a photo, discovery list, send and accept an interest, chat live between two browsers, block, report, notification bell, admin login per role, dashboard.
- [ ] **Payments (Razorpay Test Mode):** buy with `success@razorpay`; fail with `failure@razorpay`, then retry; close the tab right after paying (the webhook must confirm); refund from admin; check the webhook deliveries in the Razorpay dashboard (all `2xx`).
- [ ] Manual test cases marked **Manual** in [test cases](test-cases.md) for the areas changed in this release.
- [ ] Mobile (Android Chrome, iOS Safari) and desktop smoke of the web app; admin on desktop.
- [ ] Safety copy present: 18+, verification is not a safety guarantee, never send money, emergency numbers.

## 4. Production configuration

- [ ] `APP_ENV=production`, `NODE_ENV=production`; the API refuses to start otherwise-invalid config (env schema).
- [ ] Secrets set in the secret store only: JWT secrets (different for member/admin), `PHONE_HASH_SECRET`, `PHONE_ENCRYPTION_KEY`, `OTP_HMAC_SECRET`, Cloudinary, SMS, **Razorpay live keys** (`rzp_live_`) and webhook secret.
- [ ] Razorpay live webhook configured to `https://<api>/api/v1/webhooks/razorpay` with the events in [webhook §3](../payments/webhook.md#3-events-handled); auto-capture on.
- [ ] MSG91 configured with DLT-approved templates and a real login code received on a phone ([MSG91 setup](../notifications/msg91.md)). The dev provider is refused outside development.
- [ ] `MEDIA_STORAGE=cloudinary` (local storage is refused outside development).
- [ ] The [deployment checklist](../deployment/production-setup.md#11-deployment-checklist) is complete: `preflight.sh` and the full `healthcheck.sh` pass on the server (TLS, HSTS, CSP including the Razorpay entries, WebSocket upgrade, CORS for both app origins, API bound to `127.0.0.1`).
- [ ] `WEB_ORIGIN` / `ADMIN_ORIGIN` are the `https://` production origins (CORS and CSRF depend on them).
- [ ] Log level `info`; logs shipped and retained; spot-check that logs contain no phone numbers, OTPs or tokens.
- [ ] Real admins created with `npm run admin:create`; no dev admin accounts; super admins limited to named people (at least two).
- [ ] Admin sign-in has no second factor (removed): strong unique admin passwords, admin panel and admin API restricted in Nginx (ideally an IP allow-list), audit log review scheduled.
- [ ] Open items in the [security checklist §5](../security/security-checklist.md#5-before-launch-open-items) are closed or explicitly accepted.

## 5. After deploy

- [ ] `/api/v1/health` is `200`; the web and admin apps load.
- [ ] One real sign-in and one real ₹1 test purchase (then refunded) on production by the release owner.
- [ ] The Razorpay dashboard shows the webhook delivered `2xx`.
- [ ] Background jobs are running: logs show the sanction expiry, notification and payment jobs without errors for 15 minutes.
- [ ] Watch error rates, `429`s and `401` webhook rejections for the first hour.
- [ ] Rollback plan written: previous build artifact kept; migrations are backward-compatible or have a tested `down`.

## 6. Sign-off

| Role | Name | Date | Notes |
|---|---|---|---|
| Release owner | | | |
| QA | | | |
| Security review (for auth, payments or data changes) | | | |
