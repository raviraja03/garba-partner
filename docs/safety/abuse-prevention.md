# Abuse Prevention

> Related: [Moderation system](moderation-system.md), [Admin actions](admin-actions.md), [Incident response](incident-response.md), [Chat safety](../chat/safety.md), [OTP flow](../auth/otp-flow.md)

## 1. Purpose and layers

Abuse is handled in layers, from what a member controls to what moderators decide:

| Layer | Examples | Decided by |
|---|---|---|
| Self-protection | Block, report, unmatch | The member, instantly |
| Limits | Rate limits and daily caps on every sensitive action | The API |
| Friction | Contact-sharing and money-request nudges, scam warnings | The web app |
| Detection | Automated flags into the moderation queue | The API (never sanctions) |
| Enforcement | Warn, restrict chat, suspend, ban | A moderator |

## 2. Blocking

| Endpoint | Behaviour |
|---|---|
| `POST /api/v1/blocks` `{ userId }` | Idempotent (`201` new, `200` existing). Under the pair lock: the block is stored, pending interests between the pair are cancelled and their active match ends (`blocked`, live `match:ended`). Logged as `safety.block_created` |
| `DELETE /api/v1/blocks/:userId` | Idempotent. Restores **nothing**: earlier matches and chats stay ended. Logged as `safety.block_removed` when a block was removed |
| `GET /api/v1/blocks` | Your blocked members (name, thumbnail, date) |

Effects are symmetric: neither member sees the other in discovery, profiles, interests or chat. The other member is never told. Suspended members can still block and unblock.

**Web:** Block on profiles and chats; **My profile → Blocked members** (`/profile/blocked`) lists blocks with **Unblock** after a confirmation that explains nothing is restored.

**Churn:** block/unblock cycles can be used to get someone's attention. Both directions are rate-limited (below) and logged, so the pattern shows in the safety logs.

## 3. Rate limits

| Action | Limit | Where |
|---|---|---|
| OTP requests | 5 per phone per hour, 10 per phone per day, 20 per IP per hour, 30 s resend cooldown | [OTP flow](../auth/otp-flow.md) |
| OTP attempts | 5 per code | same |
| Reports | 10 per member per 24 h (service, logged `safety.report_limit_reached`) + 10 per hour burst guard (middleware) | `LIMITS.REPORTS_PER_DAY` |
| Blocks | 30 per member per hour | `LIMITS.BLOCKS_PER_HOUR` |
| Unblocks | 30 per member per hour | `LIMITS.UNBLOCKS_PER_HOUR` |
| Warning acknowledgements | 30 per member per minute | `routes.ts` |
| Interests | 25 per day; 30 interest actions per minute; 30-day cooldown after a decline | [interests](../matching/interests.md) |
| Messages | 30 per member per minute, shared by REST and socket | `LIMITS.MESSAGES_PER_MINUTE` |
| Socket events | 120 per socket per minute; 16 KB payloads | [chat safety](../chat/safety.md#4-abuse-controls) |
| Discovery | 60 requests per member per minute | `LIMITS.DISCOVERY_REQUESTS_PER_MINUTE` |
| Photo uploads | 20 per member per hour | `LIMITS.PROFILE_IMAGE_UPLOADS_PER_HOUR` |
| OTP endpoints (per IP) | send 10/min, verify 30 per 15 min, refresh 60 per 15 min, admin login 10 per 15 min | `middlewares/rate-limit.ts` |

Exceeding a limit returns `429 RATE_LIMITED` with `Retry-After`. Middleware limits are in memory (one API process); the report and interest caps are counted in the database and survive restarts.

## 4. Suspicious activity detection

`createSuspiciousActivityDetector` (`apps/api/src/modules/safety/suspicious-activity.service.ts`) runs **after** a message or block has committed. It never blocks the action and never throws.

| Trigger | Pattern | Report reason | Automatic effect |
|---|---|---|---|
| `money_requests` | ≥ **3** messages that look like money requests (`looksLikeMoneyRequest`) from one member within **24 h** | `asking_for_money` (P1) | Hidden from discovery (`suspicious_activity`) |
| `repeated_messages` | The **same message** (≥ 20 characters) sent in ≥ **4** different chats within **1 h** | `spam` (P2) | Hidden from discovery |
| `frequently_blocked` | Blocked by ≥ **5** members within **7 days** | `other` (P2) | None (being blocked is not wrongdoing by itself) |

Thresholds live in `LIMITS.SUSPICIOUS_*`.

What a detection does:

1. Opens a `source = 'system'` report in the queue, with `evidence.trigger`, `evidence.signals` (counts only) and, for chat triggers, up to 5 of the **flagged member's own** messages. It never copies the other person's messages.
2. At most **one open flag per member and trigger** (unique index). Later detections refresh `signals.lastDetectedAt` instead of adding reports.
3. Records `suspicious.<trigger>` (warning) in the safety logs, plus `safety.auto_hidden` if the member was hidden.
4. **Never** suspends, bans, restricts chat or warns. A moderator reviews the flag like any report and can dismiss it (clearing the hide) or act.

Other signals already recorded: `interest.limit_reached`, `safety.report_limit_reached`, `auth.otp_rate_limited`, `auth.otp_attempts_exceeded`, `auth.refresh_token_reuse`, `admin.account_locked`. Reports from 3 different members within 7 days auto-hide the member ([moderation system §5](moderation-system.md#5-automatic-protection-and-what-is-never-automatic)).

**Privacy:** detection reads a message's text only to set boolean flags at send time (`contains_contact_info`, `contains_money_request`, both moderation context and never returned to members) and to count identical messages. No text goes into logs.

## 5. Scam and money warnings

| Where | What |
|---|---|
| Detection | `looksLikeMoneyRequest(text)` in `packages/shared/src/utils/text.ts`: requests to send, pay, lend or transfer money; payment apps (GPay, PhonePe, Paytm, UPI, BHIM); UPI IDs; OTP, CVV, card and bank details; gift cards, crypto, "investment plans"; Hinglish/Gujarati phrasing (*paise bhejo*, *udhaar*, *rupiya moklo*). Prices ("the pass is ₹500") are deliberately **not** matched |
| Recipient (chat) | Under a received message that matches: "Be careful: never send money, gift cards, UPI payments, OTPs or bank details to someone you met here…" with **Report a money request** (pre-selects *Asking for money*) and a link to scam tips |
| Sender (chat) | Before sending a matching message: a nudge that asking for money breaks the guidelines, with **Send anyway** (the message is not blocked) |
| Every chat | Standing safety card: meet in public, tell a friend, never send money or share OTPs |
| Safety centre | `/safety#money`: scam patterns and how to report |
| Moderators | Repeated requests are flagged ([§4](#4-suspicious-activity-detection)) |

The detector is a heuristic: it misses some scams and matches some harmless messages. The warning therefore advises and never accuses, and nothing is blocked automatically. The pattern list is covered by unit tests with both positive and false-positive cases (`packages/shared/test/safety.test.ts`).

## 6. Safety logs

`safety_logs` is append-only (trigger). Rows keep `user_id`/`admin_id` without foreign keys, so they survive account erasure.

| Event type | Severity | When |
|---|---|---|
| `auth.otp_rate_limited`, `auth.otp_attempts_exceeded`, `auth.refresh_token_reuse`, `admin.account_locked`, `rate_limit.exceeded` | warning | Authentication abuse |
| `safety.block_created`, `safety.block_removed` | info | Blocks |
| `safety.report_created` | info / warning / critical (by priority) | New member report |
| `safety.report_limit_reached` | warning | Report cap hit |
| `safety.auto_hidden` | warning | Automatic discovery hide |
| `suspicious.money_requests`, `suspicious.repeated_messages`, `suspicious.frequently_blocked` | warning | New automated flag |
| `interest.limit_reached` | warning | Interest cap hit |
| `sanction.expired` | info | Timed sanction ended |
| `verification.*` | various | Identity verification |

Metadata holds IDs, counts and reasons. It **never** holds message text, phone numbers, OTPs, tokens or raw IP addresses (IPs are HMAC-hashed and never returned). Viewer: `GET /api/v1/admin/safety-logs` (`safety_logs:view`) and the admin **Safety logs** page.

## 7. False and malicious reports

- Reports are capped (10 per day) and merged per reporter and member, so one person can't flood the queue about someone.
- Automatic effects need either a P0 reason or **three different** reporters, and are limited to hiding from discovery.
- Moderators see the reporter's identity and the member's report history on the report page, and decide. Dismissing clears the hide.
- Knowingly false reports break the guidelines; moderators can warn or sanction the reporter from their member page.

## 8. Ban evasion

- A banned number gets the normal "code sent" response, but **no SMS** is sent, and verifying is refused with `ACCOUNT_BANNED`.
- Refresh tokens of banned accounts are revoked on use.
- Planned: when account deletion ships, the phone hash of a banned account moves to `banned_phone_hashes`, so deleting the account doesn't allow a new sign-up ([database architecture](../architecture/database-architecture.md)).

## 9. Known limitations

- In-memory middleware limits and socket rooms: with several API processes, move them to Redis ([chat architecture §8](../chat/architecture.md#8-scaling)).
- Detection covers chat and blocks only; photo and bio screening (beyond contact-detail checks) is not automated.
- No device fingerprinting: a banned person with a new phone number can sign up again.
- Money-request detection is English/Hinglish/Gujarati-transliteration only.
