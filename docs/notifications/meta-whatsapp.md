# Meta WhatsApp Cloud API

GarbaMates sends two things on WhatsApp, both through Meta's official Cloud API:

| What | Template category | Switch |
| --- | --- | --- |
| Login codes (OTP) | Authentication | `OTP_PROVIDER=meta_whatsapp` |
| Notifications (interest, match, message, booking, …) | Utility | `WHATSAPP_ENABLED=true` + `MESSAGING_PROVIDER=meta` |

Delivery results (sent, delivered, read, failed) come back through a signed webhook.

> **Not yet verified with real messages.** The code builds the requests Meta documents, and the automated tests check them against a stand-in for Meta. Nothing has been sent through Meta: that needs your Meta app, credentials, approved templates and the number set up for the Cloud API. Do the first-send check in §8 before relying on it.

This replaced MSG91 (§12).

## 1. What you need from Meta

All of this is done by you in Meta's dashboards. Nothing in this repository changes your Meta account, your number or your WhatsApp Business app.

1. **A Meta Business portfolio**, verified (Business Settings → Security Centre). Verification is needed to raise sending limits and to use your own display name.
2. **A Meta app** of type *Business* with the **WhatsApp** product added ([developers.facebook.com](https://developers.facebook.com/apps)).
3. **A WhatsApp Business Account (WABA)** with the sending number, **+91 87697 95033**, added to it (§2 first: read it before touching the number).
4. **The Phone Number ID** of that number (WhatsApp → API Setup). This is an ID Meta assigns, not the phone number.
5. **A permanent access token.** Business Settings → Users → System users → create a system user, assign it the app and the WABA with full control, then *Generate token* with the permissions `whatsapp_business_messaging` and `whatsapp_business_management`. The temporary token shown on the API Setup page expires in about a day and is only for a first experiment.
6. **The app secret.** App dashboard → App settings → Basic → App secret.
7. **Approved templates** (§4 and §5).
8. **The webhook registered** (§6), which needs the API deployed on HTTPS first.

## 2. Your number and the WhatsApp Business app (coexistence)

You want to keep using +91 87697 95033 in the WhatsApp Business app. Normally a number is either in the app or on the Cloud API, and moving it to the API **removes it from the app**. Meta's *coexistence* feature is the exception: it lets one number stay in the WhatsApp Business app and also be used through the Cloud API.

**This cannot be checked or done from the code.** It is decided in Meta's onboarding flow. What to know before you start:

- Coexistence is set up by connecting the number through **Embedded Signup** and choosing the option to *connect your existing WhatsApp Business app*, then scanning a QR code from the app on the phone. It is offered through Meta Business Partners / Tech Providers; ask the one you use (or Meta support) to enable it for you if the option does not appear.
- Meta sets the eligibility rules (among them: a recent version of the WhatsApp Business app, the number in active use for some time, and a supported country). Check Meta's current coexistence documentation for the exact conditions before starting.
- **Do not use "Add phone number" → register on the plain API Setup page for this number.** Registering a number for the Cloud API that way disconnects it from the WhatsApp Business app, and the chat history in the app can be lost.
- With coexistence, messages sent through the API also appear in the app. Some app features change or are unavailable for a coexisting number; read Meta's list first.

**If coexistence is not available for the number, stop and decide before going further.** The options are a second number for the API (leaving this one in the app untouched), or moving this number to the API and giving up the app. Neither is something to do by accident.

Until the number is live on the Cloud API, test with the **test number** Meta gives every app (WhatsApp → API Setup): it can message up to five phone numbers you add, and needs no change to your real number.

## 3. Environment variables

In `.env` locally, `/etc/garba-partner/production.env` on the server. Never commit them. None of them may be given a `VITE_` name: that would publish it in the website's JavaScript.

| Variable | Needed when | Value |
| --- | --- | --- |
| `OTP_PROVIDER` | Always | `meta_whatsapp` to send login codes on WhatsApp. `dev` only works in development |
| `META_WHATSAPP_ACCESS_TOKEN` | Meta is used | The system-user token. **Secret** |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Meta is used | The Phone Number ID (digits) |
| `META_WHATSAPP_APP_SECRET` | Meta is used | The app secret. **Secret.** Verifies webhook calls |
| `META_WHATSAPP_VERIFY_TOKEN` | Meta is used | Any long random string you make up. You type the same string into Meta when registering the webhook. **Secret** |
| `META_WHATSAPP_API_VERSION` | Optional | Graph API version, default `v25.0` |
| `META_WHATSAPP_TEMPLATE_LANGUAGE` | Optional | Language code of your templates exactly as WhatsApp Manager shows it, default `en` (often `en_US`) |
| `META_WHATSAPP_OTP_TEMPLATE` | `OTP_PROVIDER=meta_whatsapp` | Name of the approved login-code template |
| `MESSAGING_PROVIDER` | WhatsApp notifications | `meta` (default `log` sends nothing and is development-only) |
| `WHATSAPP_ENABLED` | | `true` to send notifications on WhatsApp |
| `META_WHATSAPP_TEMPLATES` | `WHATSAPP_ENABLED=true` with Meta | `type:templateName` pairs, comma-separated (§5) |

The business account ID is not needed: the app only sends messages and reads delivery reports.

The API checks these at start-up and names anything missing. Minimal production setup (login codes only):

```env
OTP_PROVIDER=meta_whatsapp
META_WHATSAPP_ACCESS_TOKEN=<system-user token>
META_WHATSAPP_PHONE_NUMBER_ID=<phone number id>
META_WHATSAPP_APP_SECRET=<app secret>
META_WHATSAPP_VERIFY_TOKEN=<a long random string>
META_WHATSAPP_OTP_TEMPLATE=<template name>
```

Generate the verify token with `node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"`.

`SMS_PROVIDER` was renamed to `OTP_PROVIDER`. If the old line is still in the env file the API stops at start-up and says so.

## 4. Login codes

**Create the template.** WhatsApp Manager → Message templates → Create template:

- Category **Authentication**. WhatsApp does not allow one-time codes in any other category, and a plain text message cannot be used.
- Meta writes the body itself ("<code> is your verification code."). You choose the options: the security line ("For your security, do not share this code.") and, if you add the expiry line, set it to **5 minutes**, which is how long a GarbaMates code is valid.
- Code delivery: **Copy code** is the simplest and works for a website.
- Name it, for example, `garbamates_login_code`, submit it, and wait for **Active** status.

Put its name in `META_WHATSAPP_OTP_TEMPLATE`, and its language code in `META_WHATSAPP_TEMPLATE_LANGUAGE` if it is not `en`.

**Flow.**

```text
Member enters mobile number            web: /login
        ↓
POST /api/v1/auth/send-otp             validated, normalised to +91…; IP limit; 30s cooldown;
        ↓                              5/hour and 10/day per phone; 20/hour per IP
API generates a 6-digit code           secure random; only an HMAC is stored; valid 5 minutes;
        ↓                              any earlier code for that number is cancelled
API → Meta  POST /<version>/<phone number id>/messages
        ↓                              authentication template, the code in the body AND the button
Meta → WhatsApp → member's phone
        ↓
Member enters the code                 web: /login/verify
        ↓
POST /api/v1/auth/verify-otp           row locked; expiry and 5 attempts checked; constant-time
        ↓                              compare; the code is consumed
Session issued                         only now
```

- GarbaMates generates and checks the code. Meta only delivers it.
- The code is never in an API response, never logged and never stored in readable form. (`LOG_OTP` exists for local debugging and is refused outside `APP_ENV=development`.)
- If Meta refuses or cannot be reached, the member sees "We could not send the code. Please try again." (HTTP 503). Meta's reason is in the server log under the request ID.
- If the number is not on WhatsApp, Meta accepts the request and reports the failure later through the webhook. The member sees the code screen and nothing arrives; `otp_requests.delivery_status` becomes `failed` with the reason. There is no SMS fallback.
- A banned number gets the same response but no message is sent.
- Two simultaneous attempts with the right code: one signs in, the others are refused.

Code: `apps/api/src/providers/otp/meta-whatsapp.otp.ts`, called from `sendOtp` in `apps/api/src/modules/auth/auth.service.ts`.

## 5. Notifications

A business may only start a WhatsApp conversation with an approved template, so each notification type needs one. Category **Utility**, fixed text, **no variables, no buttons**. Suggested wording (it matches what the app records in the delivery history):

| Type | When | Template text |
| --- | --- | --- |
| `interest_received` | Someone sends the member an interest | GarbaMates: someone would like to be your Garba partner. Open the app to respond. |
| `interest_accepted` | The member's interest is accepted | GarbaMates: your interest was accepted. Open the app to start chatting. |
| `match_created` | Two members match | GarbaMates: you have a new Garba match. Open the app to say hello. |
| `new_message` | A chat message arrives (once per unread chat) | GarbaMates: you have new messages. Open the app to read them. |
| `verification_completed` | A verification is reviewed | GarbaMates: your verification has been reviewed. Open the app to see the result. |
| `event_reminder` | An event the member is going to starts soon | GarbaMates: an event you are going to starts soon. Open the app for details. |
| `safety` | A moderator acts on the account or a report | GarbaMates: there is an important notice about your account. Open the app to read it. |
| `booking` | A pass is confirmed, cancelled or refunded | GarbaMates: there is an update on your event pass. Open the app to see it. |

```env
MESSAGING_PROVIDER=meta
WHATSAPP_ENABLED=true
META_WHATSAPP_TEMPLATES=interest_received:garba_new_interest,match_created:garba_new_match,booking:garba_pass_update
```

- **Meta decides the category, not you.** It may reclassify a template as *Marketing* (interest, match and event reminders are the likeliest). Marketing templates cost more, have stricter limits, and must not be presented as utility. If that happens, either reword the template so it only reports on something the member did, or leave that type out.
- **You do not need all eight.** A type that is not listed is simply not sent on WhatsApp.
- **Consent.** WhatsApp requires a member's opt-in before a business messages them. Notifications go only to members who turned on "Also notify me on WhatsApp" (at sign-up or in notification settings); it is off by default. Their per-type switches still apply. Login codes are exempt: the member asks for those.
- If your approved wording differs, change `CHANNEL_TEXT` in `apps/api/src/modules/notifications/channel-notifier.ts` to match.
- WhatsApp delivery never affects the in-app notification, and a Meta failure never fails the member's action.

Full pipeline: [notification channels](notification-channels.md).

## 6. Webhook

`https://<API domain>/api/v1/webhooks/meta/whatsapp`. It exists only when Meta is configured.

**Register it** (after the API is deployed with the variables set): App dashboard → WhatsApp → Configuration → Webhook → Edit. Callback URL as above; Verify token = your `META_WHATSAPP_VERIFY_TOKEN`. Then under *Webhook fields* subscribe to **messages**.

**How it works.**

- `GET`: Meta's one-time check. The endpoint returns the challenge only if the verify token matches.
- `POST`: delivery reports. The `X-Hub-Signature-256` header must be the HMAC-SHA256 of the exact request bytes, keyed with the app secret. A request without a valid signature gets 401 and changes nothing, whatever it contains.
- Only reports for our own Phone Number ID are applied.
- A status only moves forward: pending → sent → delivered → read, with `failed` between sent and delivered. So the same report twice, or reports arriving out of order, change nothing.
- If the database is down the endpoint answers 500 and Meta sends the report again (for up to 36 hours).

**What is stored.** For notifications, `notification_deliveries.status` with `delivered_at`, `read_at`, `failed_at` and the failure reason. For login codes, `otp_requests.delivery_status` and `delivery_error`. Messages are matched by a SHA-256 of Meta's message ID, not the ID itself, because Meta's IDs embed the recipient's phone number.

`sent` means Meta accepted the message. Only `delivered` means it reached the phone, and `read` depends on the member's read-receipt setting.

## 7. Local testing

Local development needs nothing from Meta: `OTP_PROVIDER=dev` shows the code on screen and `MESSAGING_PROVIDER=log` writes notifications to the server log.

```bash
npm run test -w @garba-partner/api     # Meta is replaced by a stand-in in every test
```

To try the real API from your machine, use Meta's **test number** with its temporary token and Phone Number ID, add your own phone as a recipient in API Setup, and run with `OTP_PROVIDER=meta_whatsapp`. Meta provides a `hello_world` template on the test number, but a login code needs your own authentication template. The webhook needs a public HTTPS address, so test delivery reports on the deployed server.

## 8. First-send check (production)

Do this once after configuring, with your approval at each step:

1. `NODE_ENV=production npm run env:check:prod -w @garba-partner/api` lists any missing variable.
2. Deploy, run the migration (`npm run db:migrate:prod -w @garba-partner/api`) and restart: `pm2 restart gp-api --update-env`.
3. Register the webhook (§6). Meta shows a green tick when the GET check passes.
4. **Login code:** sign in on the website with your own number. If it does not arrive:
   ```bash
   pm2 logs gp-api --lines 200 --nostream | grep -A4 'OTP delivery failed'
   ```
   ```sql
   SELECT created_at, delivery_status, delivery_error FROM otp_requests ORDER BY created_at DESC LIMIT 5;
   ```
5. **Delivery report:** a few seconds after the message arrives, `delivery_status` should change from `sent` to `delivered`. That proves the webhook and its signature check work.
   ```bash
   pm2 logs gp-api --lines 200 --nostream | grep '\[WHATSAPP\]'
   ```
6. **Notification:** turn on "Also notify me on WhatsApp" for your account, have a second account send you an interest, then:
   ```sql
   SELECT created_at, notification_type, status, delivered_at, read_at, error_message
     FROM notification_deliveries ORDER BY created_at DESC LIMIT 10;
   ```

## 9. Token security and rotation

- The access token and app secret are read from the environment by the API only. They are sent to Meta in the `Authorization` header over HTTPS, and never appear in a URL, a log line, an error message, the database or the web apps.
- Use a **system-user** token, not a personal one, so it does not die when someone leaves or changes their password. Give the system user only this app and this WABA.
- **Rotate** by generating a new token for the same system user, putting it in the env file, running `pm2 restart gp-api --update-env`, checking a login code arrives, then revoking the old token in Business Settings.
- **If a token or the app secret leaks:** revoke the token (or reset the app secret) in Meta immediately, set the new value, restart. Resetting the app secret invalidates webhook signatures until the API has the new one; Meta retries reports for 36 hours.
- Changing the verify token only matters the next time you edit the webhook in Meta.

## 10. Troubleshooting

Failure reasons are stored and logged as `[E<code>] <Meta's text>`.

| Symptom | Likely cause |
| --- | --- |
| API will not start: "META_WHATSAPP_… is required when Meta WhatsApp is used" | A variable from §3 is missing |
| API will not start: "SMS_PROVIDER: was renamed" | Replace that line with `OTP_PROVIDER=…` |
| `[E190]` | Access token expired or revoked. Generate a new system-user token |
| `[E10]` / `[E200]`–`[E299]` | The token lacks permission, or the system user is not assigned the WABA |
| `[E132001]` | Template name or language code does not match an approved template |
| `[E132000]` / `[E132012]` | The template's parameters do not match: a login-code template must have exactly the code in the body and the code button; a notification template must have no variables |
| `[E132015]` / `[E132016]` | Template paused or disabled by Meta for low quality. Edit it or create a new one |
| `[E133010]` | The number is not registered for the Cloud API (§2) |
| `[E131026]` (in a delivery report) | Recipient cannot receive it: not on WhatsApp, very old app version, or has not accepted WhatsApp's terms |
| `[E131047]` | Not a template message. Should not happen: only templates are sent |
| `[E131048]` | Meta is restricting the number for spam or low quality. Check quality in WhatsApp Manager |
| `[E130429]`, `[E131056]`, `[E80007]`, `[E4]` | Rate limits. The API retries twice, then fails the send |
| `[E131049]` (in a delivery report) | Meta chose not to deliver (per-user marketing limits). A sign the template was classed as marketing |
| "Meta did not answer in time" | No answer in 8 seconds, or the server cannot reach `graph.facebook.com` on port 443. Not retried, because the message may already have been accepted |
| Webhook check fails in Meta | Wrong verify token, API not reachable on HTTPS, or Meta not configured so the route does not exist (404) |
| Messages arrive but status stays `sent` | Webhook not registered, the `messages` field not subscribed, or the app secret is wrong (look for 401s on the webhook path in `api_logs`) |
| No row in `notification_deliveries` | WhatsApp off, the member has not opted in, no template for that type, that notification type switched off by the member, or the account is banned |

## 11. Rollback and recovery

- **A bad deploy:** `deploy/scripts/rollback.sh` returns to the previous release. The migration adds columns and one allowed status only, so the previous code runs against the migrated database without undoing it.
- **Undoing the migration** is possible (`db:migrate:undo`); it turns `read` rows back into `delivered` and drops the new columns. Only needed if you abandon the feature.
- **Meta is down or the number is restricted:** notifications keep working in the app. Login does not: there is no second channel for codes. The fastest recovery is fixing the Meta side; an SMS fallback would be new work.
- **Going back to MSG91** is not a configuration switch: that code was removed. It is in git history (the commit before this change) and on the `feature/SMS-otp` branch.

## 12. What replaced MSG91

| Before (MSG91) | Now (Meta) |
| --- | --- |
| `SMS_PROVIDER=msg91` (SMS login codes) | `OTP_PROVIDER=meta_whatsapp` (WhatsApp login codes) |
| `MESSAGING_PROVIDER=msg91` (SMS and WhatsApp notifications) | `MESSAGING_PROVIDER=meta` (WhatsApp notifications) |
| `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID`, `MSG91_SMS_TEMPLATE_IDS`, `MSG91_WHATSAPP_NUMBER`, `MSG91_WHATSAPP_TEMPLATES`, `MSG91_WHATSAPP_LANGUAGE`, `MSG91_WHATSAPP_NAMESPACE` | Removed. See §3 |
| No delivery results | Webhook: sent, delivered, read, failed |
| No consent setting | WhatsApp opt-in per member |

Removed: `providers/msg91/`, `providers/sms/msg91.sms.ts`, `providers/messaging/msg91.provider.ts`, their tests and `docs/notifications/msg91.md`. MSG91 was called over plain HTTP, so no package was uninstalled. `providers/sms/` became `providers/otp/`.

**There is no SMS any more**, for login codes or notifications. The `sms` channel value remains in the database schema because old rows use it, and `SMS_ENABLED` still works with the development `log` provider, but no provider sends real SMS.

Old `notification_deliveries` rows with `provider = 'msg91'` are kept as history. Remove any `MSG91_*` lines from your env files: they are ignored, but the auth key is a credential you should also revoke in MSG91.

## 13. Tests

- `apps/api/src/providers/meta/whatsapp.client.test.ts`: request format for both template kinds, the configured API version, refusals, rate limits and retries, no retry after a timeout, signature verification, the stored message reference, and the start-up rules.
- `apps/api/src/modules/whatsapp/whatsapp-webhook.int.test.ts` (needs `TEST_DATABASE_URL`): a full sign-in through the stand-in, a Meta refusal, delivery reports for login codes, four simultaneous verifications, notifications with and without opt-in, the webhook GET check, valid and invalid signatures, duplicate and out-of-order reports, failure reasons, and reports that must be ignored.
- `apps/api/src/modules/auth/auth.int.test.ts`: the existing OTP rules (expiry, wrong codes, attempt limit, cooldown, rate limits).

## 14. Limitations

- **Not verified with a real Meta account** (see the note at the top).
- **No SMS fallback.** A member without WhatsApp cannot sign in.
- **Failed sends are not retried later.** Only throttling and temporary Meta faults are retried, twice, straight away.
- **Templates are managed by hand** in WhatsApp Manager; the app does not create or check them. A wrong name fails at send time, not at start-up.
- **Incoming WhatsApp messages are ignored.** Replies to a notification or login code are not read or answered.
- **Changing the Phone Number ID** orphans delivery reports for messages sent from the old one.
