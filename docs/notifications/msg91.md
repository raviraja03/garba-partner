# MSG91 setup

MSG91 sends three things for GarbaMates:

| What | MSG91 product | Switch |
| --- | --- | --- |
| Login codes (OTP) on WhatsApp | WhatsApp | `SMS_PROVIDER=msg91_whatsapp` |
| Notifications by SMS | SMS (Flow API) | `SMS_ENABLED=true` + `MESSAGING_PROVIDER=msg91` |
| Notifications by WhatsApp | WhatsApp | `WHATSAPP_ENABLED=true` + `MESSAGING_PROVIDER=msg91` |

Each can be turned on separately. Login codes are the one production needs: without `SMS_PROVIDER=msg91_whatsapp` the API refuses to start outside development.

**Login codes by SMS are switched off for now.** The SMS adapter is still in the code (`providers/sms/msg91.sms.ts`, with its tests), but the `msg91` option that selects it is commented out, so `SMS_PROVIDER=msg91` is refused. To bring it back, uncomment `'msg91'` and its rule in `packages/config/src/server/env.ts` and the `case 'msg91'` in `apps/api/src/providers/sms/index.ts`.

> **No real message has been sent yet.** That needs your MSG91 account, DLT registration and approved templates. What has been checked: the automated tests use a stand-in for MSG91, and both MSG91 endpoints were called once with a deliberately invalid key, which confirmed they are reachable and that a refusal is reported correctly ("Invalid authkey or Token" for SMS, "Unauthorized" for WhatsApp). A successful send with a valid key and an approved template is unverified: do the first-send check in §6 before relying on it.

## 1. What you need from MSG91

1. **An MSG91 account** with a **WhatsApp Business number connected** (MSG91 dashboard → WhatsApp; Meta business verification is part of this). DLT registration is only needed if you later send SMS.
2. **The auth key.** MSG91 dashboard → your profile (top right) → **Authkey**. Create one for this server and, if MSG91 offers it, restrict it to the server's IP address.
3. **An approved WhatsApp template for login codes** (§3).
4. Optional: **SMS templates for notifications** (§4) and a **WhatsApp number with approved templates** (§5).

## 2. Environment variables

Put these in the env file (`.env` locally, `/etc/garba-partner/production.env` on the server). Never commit them.

| Variable | Needed when | Value |
| --- | --- | --- |
| `SMS_PROVIDER` | Always | `msg91_whatsapp` to send login codes on WhatsApp. `dev` only works in development. (The name is historical) |
| `MSG91_AUTH_KEY` | Any MSG91 use | The auth key. **Secret** |
| `MSG91_WHATSAPP_OTP_TEMPLATE` | `SMS_PROVIDER=msg91_whatsapp` | Name of the approved login-code template |
| `MSG91_WHATSAPP_OTP_COPY_BUTTON` | Optional | `true` (default). `false` only if the template has no "Copy code" button |
| `MESSAGING_PROVIDER` | Notifications by SMS or WhatsApp | `msg91` (default `log` sends nothing and is development-only) |
| `SMS_ENABLED` | | `true` to send notifications by SMS |
| `MSG91_SMS_TEMPLATE_IDS` | `SMS_ENABLED=true` with MSG91 | `type:templateId` pairs, comma-separated (§4) |
| `WHATSAPP_ENABLED` | | `true` to send notifications by WhatsApp |
| `MSG91_WHATSAPP_NUMBER` | `SMS_PROVIDER=msg91_whatsapp`, or `WHATSAPP_ENABLED=true` with MSG91 | Your WhatsApp Business number, digits with country code (`919XXXXXXXXX`) |
| `MSG91_WHATSAPP_TEMPLATES` | `WHATSAPP_ENABLED=true` with MSG91 | `type:templateName` pairs, comma-separated (§5) |
| `MSG91_WHATSAPP_LANGUAGE` | Optional | Template language code, default `en` |
| `MSG91_WHATSAPP_NAMESPACE` | Optional | Only if MSG91 shows a namespace for your templates |

The API checks these at start-up and names anything missing. A minimal production setup (login codes only):

```env
SMS_PROVIDER=msg91_whatsapp
MSG91_AUTH_KEY=<your auth key>
MSG91_WHATSAPP_NUMBER=919XXXXXXXXX
MSG91_WHATSAPP_OTP_TEMPLATE=<template name>
```

After changing the env file: `pm2 restart gp-api --update-env`.

## 3. Login codes on WhatsApp

**Create the template.** WhatsApp only allows one-time codes in a template of the **Authentication** category. MSG91 dashboard → **WhatsApp** → **Templates** → create:

- Category: **Authentication**. Language: English.
- Meta writes the body for this category itself ("<code> is your verification code."); you choose the options (security recommendation, expiry line).
- Button: **Copy code** (the default). If you create it without a button, set `MSG91_WHATSAPP_OTP_COPY_BUTTON=false`.
- Give it a name such as `garbamates_login_code` and submit it. Wait until its status is **Approved**.

Put the template's name in `MSG91_WHATSAPP_OTP_TEMPLATE` and your connected number in `MSG91_WHATSAPP_NUMBER`. If your template uses a language other than `en`, set `MSG91_WHATSAPP_LANGUAGE` to its code (for example `en_US`).

**Flow.**

```text
Member enters mobile number            web: /login  ("We'll send a 6-digit code to your WhatsApp")
        ↓
POST /api/v1/auth/send-otp             rate limits, cooldown, per-phone and per-IP caps
        ↓
API generates a 6-digit code           stores only an HMAC of it (otp_requests), valid 5 minutes
        ↓
API → MSG91 WhatsApp API               template + code in the body and in the "Copy code" button
        ↓
MSG91 → WhatsApp → member's phone
        ↓
Member enters the code                 web: /login/verify
        ↓
POST /api/v1/auth/verify-otp           API checks the code itself (5 attempts), creates the session
```

- GarbaMates generates and checks the code. MSG91 and WhatsApp only deliver it.
- The code is never in the API response and never logged (unless you turn on `LOG_OTP`, see [logging](../development/logging.md#3-otp-logging)).
- If MSG91 refuses or cannot be reached (10-second limit), the member sees "We could not send the code. Please try again." (HTTP 503). MSG91's reason is in the server log under the request ID.
- **If the number is not on WhatsApp, nothing arrives and the member cannot sign in.** MSG91 usually accepts such a request and reports the failure only in its own delivery report, so the website still shows the code screen. There is no SMS fallback while SMS is switched off.
- A banned number gets the same response but no message is sent.

Code: `apps/api/src/providers/sms/msg91-whatsapp.otp.ts`, called from `sendOtp` in `apps/api/src/modules/auth/auth.service.ts`. The interface it implements is still called `SmsProvider`: it means "delivers a login code".

## 4. Notifications by SMS

DLT does not allow free text, so each notification type needs its own approved template. The text is fixed (no variables). Suggested wording, which matches what the app records in the delivery history:

| Type | When it is sent | Template text |
| --- | --- | --- |
| `interest_received` | Someone sends the member an interest | GarbaMates: someone would like to be your Garba partner. Open the app to respond. |
| `interest_accepted` | The member's interest is accepted | GarbaMates: your interest was accepted. Open the app to start chatting. |
| `match_created` | Two members match | GarbaMates: you have a new Garba match. Open the app to say hello. |
| `new_message` | A chat message arrives (once per unread chat) | GarbaMates: you have new messages. Open the app to read them. |
| `verification_completed` | A verification is reviewed | GarbaMates: your verification has been reviewed. Open the app to see the result. |
| `event_reminder` | An event the member is going to starts soon | GarbaMates: an event you are going to starts soon. Open the app for details. |
| `safety` | A moderator acts on the account or a report | GarbaMates: there is an important notice about your account. Open the app to read it. |
| `booking` | A pass is confirmed, cancelled or refunded | GarbaMates: there is an update on your event pass. Open the app to see it. |

If your approved wording differs, change `CHANNEL_TEXT` in `apps/api/src/modules/notifications/channel-notifier.ts` to match, so the history shows what was really sent.

Create each template in MSG91 and list the IDs:

```env
MESSAGING_PROVIDER=msg91
SMS_ENABLED=true
MSG91_SMS_TEMPLATE_IDS=interest_received:<id>,match_created:<id>,booking:<id>
```

**You do not need all eight.** A type that is not listed is simply not sent by SMS (no row, no error). Start with the ones worth paying for; `new_message` is the highest-volume type.

## 5. Notifications by WhatsApp

1. MSG91 dashboard → **WhatsApp** → connect your WhatsApp Business number (Meta business verification is part of this).
2. Create one template per notification type, category **Utility**, language English, body text as in §4, **no variables, no buttons**. Wait for Meta's approval.
3. List the template names:

```env
MESSAGING_PROVIDER=msg91
WHATSAPP_ENABLED=true
MSG91_WHATSAPP_NUMBER=919XXXXXXXXX
MSG91_WHATSAPP_TEMPLATES=interest_received:garba_new_interest,match_created:garba_new_match
```

As with SMS, a type without a template is not sent.

## 6. First-send check

Do this once after configuring, on the server:

1. Restart the API and confirm it starts: `pm2 restart gp-api --update-env`, then `pm2 logs gp-api --lines 30`. A missing variable is named in the log.
2. **Login code:** sign in on the website with your own number. The WhatsApp message should arrive within a few seconds. If you see "We could not send the code", find the reason:
   ```bash
   pm2 logs gp-api --lines 200 --nostream | grep -A3 'OTP delivery failed'
   ```
3. **Notifications:** with a second account, send an interest to yours. Then:
   ```bash
   pm2 logs gp-api --lines 200 --nostream | grep '\[NOTIFICATION\]'
   ```
   ```sql
   SELECT created_at, channel, notification_type, status, provider_message_id, error_message
     FROM notification_deliveries ORDER BY created_at DESC LIMIT 10;
   ```
4. In MSG91: **SMS → Reports** (or **WhatsApp → Reports**) shows the same message and whether the operator delivered it. `provider_message_id` is MSG91's request ID.

## 7. Notification flow

```text
Something happens (interest, match, message, booking, moderation, reminder job)
        ↓
notifier.notify()                 saves the in-app notification, pushes it to the open app
        ↓
ChannelNotifier                   for each enabled channel that has a template for this type:
        ├── claims  <notification id>:sms       in notification_deliveries (unique → no duplicates)
        │     └── MSG91 Flow API  → row becomes  sent  or  failed (+ reason)
        └── claims  <notification id>:whatsapp
              └── MSG91 WhatsApp  → row becomes  sent  or  failed (+ reason)
```

- The member's notification preferences apply to SMS and WhatsApp as they do in the app.
- Channels run independently and after the API response; a MSG91 failure never fails the member's action.
- `sent` means MSG91 accepted the message. Whether the phone received it is in MSG91's reports (see Limitations).

Full description: [notification channels](notification-channels.md).

## 8. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| API will not start: "MSG91_… is required when …" | A variable from §2 is missing for a switch that is on |
| API will not start: `MSG91_SMS_TEMPLATE_IDS: "…" is not "<notification type>:<template>"` | A typo in a type name. Types are listed in §4 |
| "We could not send the code", and the log says `Unauthorized` (WhatsApp) or `Invalid authkey or Token` (SMS) | Wrong `MSG91_AUTH_KEY`, or the key is restricted to another IP |
| `Invalid template` / `template id missing` | Wrong template ID, or the template is not approved / not mapped to a DLT template ID |
| MSG91 accepts it but nothing arrives | DLT: text or sender ID does not match the approved template, or the number is on DND and the template is promotional. Check MSG91's delivery report |
| `MSG91 did not answer in time` | MSG91 took over 10 seconds, or the server cannot reach `control.msg91.com` / `api.msg91.com` on port 443 |
| The code screen appears but no WhatsApp message arrives | The number is not on WhatsApp, the template is not approved, its name or language code is wrong, or it has a "Copy code" button and `MSG91_WHATSAPP_OTP_COPY_BUTTON` is `false` (or the reverse). Check MSG91 → WhatsApp → Reports |
| WhatsApp `failed` with a template error | Template not approved yet, wrong name or language code, or it has variables or buttons |
| No row in `notification_deliveries` at all | Channel off, no template for that type, the member turned that notification off, or the account is banned |

## 9. Security

- `MSG91_AUTH_KEY` is sent only in the `authkey` request header, over HTTPS. It is never in a URL, a log line, an error message or the database.
- Phone numbers go to MSG91 in full (it has to deliver to them) and are masked everywhere on our side.
- MSG91 receives the member's number and the message. Mention MSG91 as a processor in your privacy policy.

## 10. Tests

`apps/api/src/providers/msg91/msg91.test.ts` and `msg91.int.test.ts`: request bodies and headers for all three uses, refusals (including ones MSG91 sends with HTTP 200), timeouts and network failures, template maps, the start-up rules, a full sign-in with the code delivered through the stand-in, and notifications sent, skipped and failed. MSG91 itself is replaced by a stand-in in every test.

## 11. Limitations

- **A successful send is not verified against the live MSG91 service** (see the note at the top).
- `realTimeResponse` makes MSG91 check the key and template before answering. Whether it also reports every DLT problem at that point is not known; delivery problems after acceptance show only in MSG91's reports.
- **No delivery receipts.** `delivered` is never set; MSG91 can call a webhook with delivery status, and that endpoint is not built.
- **No retries.** A failed send stays `failed`.
- **No fallback** from WhatsApp to SMS or the other way round.
- Login codes go by WhatsApp only. A member whose number is not on WhatsApp cannot sign in: there is no SMS fallback while the SMS option is switched off.
- Template text lives in MSG91; the wording recorded in `notification_deliveries.message` is ours and must be kept the same by hand.
