# Notification channels (SMS and WhatsApp)

How a notification is delivered outside the app, and where the delivery history is kept. The in-app list is described in [notifications](notifications.md); this builds on it.

> **Status: no real provider is connected yet.** The project has no SMS or WhatsApp integration (the only SMS code is the development stub for login codes). What exists is the full pipeline with a development provider that writes the message to the server log instead of sending it. Both channels are therefore refused outside `APP_ENV=development` until a real provider is added (§5).

## 1. Flow

```text
Application event (interest, match, message, booking, …)
        ↓
Notifier.notify()                      modules/notifications/notifications.service.ts
        ↓  stores the in-app notification, pushes it to open sockets
ChannelNotifier.sendNotification()     modules/notifications/channel-notifier.ts
        ├── sendSMS()        → MessageProvider (sms)
        └── sendWhatsApp()   → MessageProvider (whatsapp)
                ↓
        notification_deliveries (one row per notification and channel)
```

Nothing calls a provider directly. Services keep calling `notifier.notify(...)` exactly as before; the channel step is inside the notifier, so every existing trigger is covered with no change to controllers or services. The same types reach the channels as reach the app, and the member's notification preferences apply to both.

`ChannelNotifier` can also be used on its own:

```ts
await channels.sendNotification({
  userId,
  type: 'booking',
  title: 'Pass update',
  message: 'GarbaMates: there is an update on your event pass. Open the app to see it.',
  referenceId: bookingId, // sending the same reference again does nothing
});
```

## 2. Delivery history: `notification_deliveries`

Migration `20261008100100-create-notification-deliveries`. The existing `notifications` table is the member's in-app list and was left unchanged, so this history has its own table.

| Column | Notes |
| --- | --- |
| `id` | UUID |
| `user_id` | FK → `users`, `CASCADE` |
| `notification_id` | FK → `notifications`, `SET NULL` (in-app notifications are purged after their retention period; the history stays) |
| `notification_type` | Same values as `notifications.type` |
| `title`, `message` | The text that was sent |
| `channel` | `sms` or `whatsapp` (checked text; a new channel is a one-line migration plus one entry in `NOTIFICATION_CHANNELS`) |
| `recipient` | Masked number, e.g. `+91XXXXXX3210`. Never the full number |
| `status` | `pending` → `sent` or `failed`. `delivered` is reserved for provider delivery receipts |
| `provider`, `provider_message_id` | Which provider, and its ID for the message |
| `error_message` | Why it failed (required when `status = 'failed'`) |
| `reference_key` | `<notification id>:<channel>`, unique |
| `sent_at`, `delivered_at`, `created_at`, `updated_at` | |

"Read" is not a delivery status here: it is `notifications.read_at`, set when the member opens the notification in the app.

Indexes: unique `reference_key`; `(user_id, created_at DESC)`; `(channel, status, created_at DESC)`; `(provider, provider_message_id)`; `notification_id`.

## 3. Failure handling

- Each channel is attempted independently and at the same time. One failing does not stop the other.
- A failure is recorded (`status = 'failed'`, `error_message`) and logged. It is never thrown: the API request, job or socket event that caused the notification always completes.
- Delivery runs after the in-app notification is saved and is not awaited, so a slow provider cannot slow an API response.
- Provider error text is cleaned before it is stored or logged (digit runs and email addresses masked, 300 characters). Credentials are never logged.

```text
[NOTIFICATION] SMS | userId=a1f0c3de-… | status=SENT
[NOTIFICATION] WHATSAPP | userId=a1f0c3de-… | status=FAILED | error=Template rejected
```

## 4. No duplicates

The row is inserted first, with `ON CONFLICT (reference_key) DO NOTHING`; only the caller whose insert succeeds sends the message. So API retries, repeated events, job reruns and a second server process cannot send the same notification twice over one channel.

Chat messages are a special case that this also handles: the app keeps one unread notification per chat and bumps its count, so ten messages produce one SMS for that chat, not ten. A new one is sent only after the member has read the chat and a later message arrives.

## 5. Privacy

- The text is fixed wording chosen by type (`CHANNEL_TEXT` in `channel-notifier.ts`). It never names another member and never repeats chat text, an address or a moderator's reason: an SMS can be read on a lock screen.
- The member's number is decrypted only to hand it to the provider. It is stored and logged masked.
- Banned and deleted accounts receive nothing.

## 6. Adding a real provider

1. Choose the provider(s). In India, SMS needs DLT-registered templates; WhatsApp needs approved message templates on the WhatsApp Business Platform.
2. Implement `MessageProvider` (`apps/api/src/providers/messaging/message.provider.ts`) once per channel. `send` must resolve only when the provider accepted the message and reject otherwise.
3. Return it from `createMessageProviders` in `apps/api/src/providers/messaging/index.ts`, and add its credentials to the env schema (`packages/config/src/server/env.ts`), `.env.example` and `deploy/env/production.env.example`. Credentials go in environment variables only.
4. Relax the rule in the env schema that refuses `SMS_ENABLED` / `WHATSAPP_ENABLED` outside development.
5. If the provider sends delivery receipts, add a signed webhook that sets `status = 'delivered'` and `delivered_at`, looked up by `(provider, provider_message_id)`.

## 7. Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `SMS_ENABLED` | `false` | Deliver notifications by SMS. Development only for now |
| `WHATSAPP_ENABLED` | `false` | Deliver notifications by WhatsApp. Development only for now |

With both `false` (the default) nothing changes: notifications are in-app only and `notification_deliveries` stays empty.

## 8. Tests

`apps/api/src/modules/notifications/channel-notifier.int.test.ts` (needs `TEST_DATABASE_URL`): both channels succeed; SMS succeeds and WhatsApp fails; SMS fails and WhatsApp succeeds; both fail; the same reference sent six times (five at once) goes out once; one channel switched off; banned member; database failure; a real API call (sending an interest) produces both rows while the request still returns 201; three chat messages produce one SMS; the development provider.

## 9. Limitations

- No real SMS or WhatsApp message is sent until a provider is added.
- A row can stay `pending` if the process dies between claiming the reference and the provider answering. It is not retried automatically.
- Failed sends are not retried. Retrying needs a queue and a retry policy, which this project does not have yet.
- Members cannot yet choose channels individually; the existing per-type preferences apply to every channel.
- Login codes do not go through this pipeline. They use the separate `SmsProvider` (`SMS_PROVIDER`).
