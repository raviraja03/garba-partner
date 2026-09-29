# Chat Moderation

> Related: [Chat safety](safety.md), [Chat architecture](architecture.md), [Matches §5](../matching/matches.md#5-admin-moderation), [Security architecture](../architecture/security-architecture.md)

## 1. Principle: no chat browsing

Moderators **cannot browse members' chats**. Message content becomes visible to the team only through a **report** about a message, and only in two limited forms:

1. The **evidence snapshot** copied into the report when it is filed.
2. For reports that are still **open or in review**, a bounded, **audited** view of the live conversation around the reported message.

There is no admin endpoint that lists or searches messages, and admins don't use sockets.

## 2. Reporting a message (member)

`POST /api/v1/reports` with `messageId`:

```json
{
  "reportedUserId": "4b1e…",
  "reason": "harassment",
  "details": "Kept asking for my address",
  "messageId": "c2b7…",
  "alsoBlock": true
}
```

| Rule | Behaviour |
|---|---|
| The message must be in a chat the reporter belongs to | Otherwise `404` |
| It must have been sent by the reported member | Reporting your own message → `400` |
| Evidence | The reported message **plus up to 10 earlier messages** (`LIMITS.REPORT_MESSAGE_CONTEXT`) are copied into `reports.evidence.messages` with the sender's role (`reporter`/`reported`), timestamp and contact-detail flag. The snapshot survives unmatching and account deletion |
| Duplicate | An open report from the same reporter about the same member is reused; the new message is **merged** into its evidence |
| Effect on the chat | Any report ends the match (`blocked` with "also block", otherwise `closed`); both members get `match:ended` live |
| Priority | `underage` and `safety_threat` are P0 and hide the reported member from discovery until review (as for profile reports) |

## 3. Reports queue (admin)

Permission: **`reports:manage`** (moderators, super admins). Event managers get `403`. All responses are `Cache-Control: no-store`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/admin/reports` | Queue: open and in-review by default (`status`, `priority`, `reason`, `source` filters), ordered **P0 first, then oldest**. Items include `involvesChat`, `trigger` (automated flags) and the number of open reports against the member |
| GET | `/api/v1/admin/reports/:id` | Detail: reporter's details, profile snapshot, **message snapshot**, other reports about the member, whether the conversation may be opened, resolution. Opening a report does **not** open the conversation |
| GET | `/api/v1/admin/reports/:id/conversation` | **Audited.** Live conversation around the reported message |
| POST | `/api/v1/admin/reports/:id/assign` | Review: `in_review`, assigned to you. Audited `report.assign` |
| POST | `/api/v1/admin/reports/:id/resolve` | `{ action, note, durationDays?, clearAutoHide? }` ([admin actions](../safety/admin-actions.md#3-resolving-a-report)) |

### Conversation access

| Rule | Detail |
|---|---|
| Only for chat reports | Reports without a conversation → `409` |
| Only while the report is **open or in review** | Resolved/dismissed reports → `409` (the snapshot stays visible) |
| Bounded | At most **25 messages before and 25 after** the reported message (`LIMITS.ADMIN_CONVERSATION_WINDOW`), from that one match only |
| Audited | Each access writes `report.conversation_view` (admin, report, match, number of messages shown, hashed IP) to the append-only audit log |
| Part of the review | The report moves to `in_review` and is assigned to the moderator if unassigned |
| Minimal identity | Messages are labelled "Reporter" / "Reported member"; no phone numbers |

In the admin UI the conversation opens only on an explicit **Open conversation (logged)** click, after a notice that access is recorded.

### Resolution

| Action | Effect |
|---|---|
| `dismiss` | Report `dismissed`. Optionally `clearAutoHide` shows the member in discovery again |
| `warn` | Report `resolved`; the member gets an in-app **warning** citing the guideline and must acknowledge it. Optionally `clearAutoHide` |
| `restrict_chat` | The member can read but **not send** messages (`CHAT_RESTRICTED`), optionally for 1/3/7/30 days |
| `suspend` | Account `suspended` (optionally timed), **all sessions revoked**, open sockets disconnected (`session:ended`) |
| `ban` | Only on a report **in review**. Account `banned`, sessions revoked, **every active match closed** (`match:ended` to partners), pending interests cancelled, sockets disconnected |

Every resolution requires a note (5–2000 characters) and is audited as `report.resolve`; sanctions are recorded in `user_sanctions` and audited as `user.*` ([admin actions](../safety/admin-actions.md)). A report can be resolved once (`409` afterwards).

## 4. Admin UI

- **Reports** (`/reports`): queue with priority badges, reason, "chat" marker, reported member (with count of open reports), status and age.
- **Report detail** (`/reports/:id`): **Assign to me**, reporter's details (or the automated flag's signals), profile snapshot, message snapshot (reported message highlighted, contact-detail flags), audited **Open conversation (logged)**, sanction history, other reports, resolution form with durations.
- From a member's page (`/users/:id`), moderators can still close individual matches and restrict interactions ([matches §5](../matching/matches.md#5-admin-moderation)).

## 5. What moderators never see

- Chats without a report, or after the report is closed (except the snapshot).
- Phone numbers, OTPs, exact locations.
- Anything more than the bounded window around a reported message.

## 6. Testing

`apps/api/src/modules/admin/reports/admin-reports.int.test.ts`: permissions (anonymous, member, event manager, moderator), queue order, snapshot without conversation access, conversation access audited and bounded to open chat reports, `in_review` assignment, conversation closed after resolution, non-chat reports refused, suspend (sessions revoked), ban (matches closed), dismiss with `clearAutoHide`, no double resolution. Chat-side evidence rules are in `apps/api/src/modules/chat/chat.int.test.ts`.
