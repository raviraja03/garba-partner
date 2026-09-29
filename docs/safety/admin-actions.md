# Admin Actions

> Related: [Moderation system](moderation-system.md), [Incident response](incident-response.md), [Authorization](../auth/authorization.md), [Matches §5 (close match, restrict interactions)](../matching/matches.md#5-admin-moderation)

## 1. Purpose

Moderators need a small set of proportionate actions, from a nudge to permanent removal. This page lists each action: what it does, who may use it, how it is undone, and what is audited.

## 2. Actions at a glance

| Action | Effect on the member | Duration | Undo | Permission | Audit action |
|---|---|---|---|---|---|
| **Review** (assign a report) | None; the report moves to `in_review`, assigned to you | — | — | `reports:manage` | `report.assign` |
| **Dismiss** | None. Can clear the automatic discovery hide | — | — | `reports:manage` | `report.resolve` |
| **Warn** | In-app warning citing the guideline; must be acknowledged | Permanent record | — | `reports:manage` (from a report) or `users:sanction` | `user.warn` |
| **Restrict chat** | Can read chats, **cannot send** messages (`403 CHAT_RESTRICTED`, REST and socket) | 1, 3, 7, 30 days or until lifted | Lift chat restriction | same | `user.restrict_chat` / `user.lift_chat_restriction` |
| **Suspend** | Status `suspended`: every session revoked, sockets disconnected, hidden from discovery, interests and chats; can still sign in to see why, block and report | 1, 3, 7, 30 days or until lifted | Reactivate | same | `user.suspend` / `user.reactivate` |
| **Ban** | Status `banned`: sessions revoked, sockets disconnected, **all active matches closed**, pending interests cancelled, can't sign in again with that number | Permanent | Lift ban (super admin only) | same; lift needs `users:unban` | `user.ban` / `user.unban` |
| Close match | Ends one match | — | — | `users:sanction` | `match.close` |
| Restrict interactions | Can't send or accept interests | Until lifted | Lift | `users:sanction` | `user.restrict_interactions` |

Roles: **moderators** and **super admins** have `reports:manage`, `users:sanction` and `safety_logs:view`. Only **super admins** have `users:unban` and `audit:view`. Event managers have none of them (`403`).

Every action requires a written reason or note (5–500 characters for user actions, 5–2000 for report resolutions). It is stored in the sanction and the audit log and is **never shown to the member**.

## 3. Resolving a report

`POST /api/v1/admin/reports/:id/resolve` (`reports:manage`)

| Field | Required | Notes |
|---|---|---|
| `action` | yes | `dismiss` \| `warn` \| `restrict_chat` \| `suspend` \| `ban` |
| `note` | yes | Internal |
| `durationDays` | no | `1`, `3`, `7` or `30`; only with `restrict_chat` or `suspend` (`400` otherwise). Omitted = until lifted |
| `clearAutoHide` | no | Only with `dismiss` or `warn` |

```http
POST /api/v1/admin/reports/9a0f…/resolve
Authorization: Bearer <admin access token>

{ "action": "restrict_chat", "note": "Hostile messages to two members, first offence", "durationDays": 3 }
```

The response is the updated report detail (`AdminReportDetailDto`) including the member's sanction history. The sanction's `reasonCode` is the report's reason and its `reportId` links back to the report.

Rules:

- **`ban` requires the report to be `in_review`** (assigned). Otherwise `409 "Assign the report to yourself and review the evidence before banning."`
- If the same sanction is already active (e.g. already suspended), the report is resolved **without a second sanction**; the audit entry records `sanctionAlreadyActive: true`.
- `warn`, `restrict_chat` and `suspend` on a banned account → `409`.
- A report can be resolved once (`409` afterwards).

## 4. Acting from a member's page

`POST /api/v1/admin/users/:userId/<action>`

| Action path | Body | Permission |
|---|---|---|
| `warn` | `{ reason, reasonCode? }` | `users:sanction` |
| `restrict-chat` | `{ reason, reasonCode?, durationDays? }` | `users:sanction` |
| `lift-chat-restriction` | `{ reason }` | `users:sanction` |
| `suspend` | `{ reason, reasonCode?, durationDays? }` | `users:sanction` |
| `reactivate` | `{ reason }` | `users:sanction` |
| `ban` | `{ reason, reasonCode? }` | `users:sanction` |
| `unban` | `{ reason }` | `users:unban` (super admin) |

`reasonCode` is the guideline category (a report reason, default `other`); on a warning, the member sees the matching guideline. The response is the updated `AdminUserDetailDto`, which now includes `chatRestricted` and `sanctions` (newest first, at most 50).

```http
POST /api/v1/admin/users/4b1e…/warn
Authorization: Bearer <admin access token>

{ "reason": "Pressuring members to meet privately", "reasonCode": "harassment" }
```

Conflicts (`409`): applying a restriction, suspension or ban that is already active; lifting one that isn't; any sanction on a banned account except `unban`.

## 5. Durations and expiry

Timed chat restrictions and suspensions store `ends_at`. The **sanction expiry job** (`startSanctionExpiryJob`, every minute, started by `server.ts`) sets `expired_at` and restores the account:

- suspension → `status = 'active'` **only if the account is still `suspended`** (a ban always wins);
- chat restriction → `chat_restricted_at = NULL`.

Each expiry writes a `sanction.expired` safety log entry. The job claims rows with `FOR UPDATE SKIP LOCKED`, so several API processes can run it safely. A sanction can outlast its end by up to one minute.

## 6. What the member sees

| Sanction | Web app |
|---|---|
| Warning | A banner above every page: "Warning from our moderators: *Guideline title*", the guideline summary, **I understand** (acknowledge) and a link to the guidelines |
| Chat restriction | Banner "You can't send messages right now" (with the end date if timed); the chat composer is replaced by a notice; reading still works |
| Suspension | Banner "Your account is suspended" with the end date or "Our team is reviewing your account"; blocking and reporting still work |
| Ban | Sign-in is refused (`ACCOUNT_BANNED`); OTP codes are no longer sent to the number |

Members never see the moderator's note, the report, the reporter or which moderator acted.

## 7. Audit trail

Every action above writes to `admin_audit_logs` **in the same transaction** as the change (`recordAdminAction`). The table is append-only (trigger). Entries hold the admin ID, action, target (`user` or `report`), metadata and an HMAC of the admin's IP.

| Action | Metadata |
|---|---|
| `user.warn`, `user.restrict_chat`, `user.suspend`, `user.ban` | `sanctionId`, `reason`, `reasonCode`, `reportId`, `durationDays`, `from`, `to`; bans add `matchesEnded`, `cancelledInterests` |
| `user.lift_chat_restriction`, `user.reactivate`, `user.unban` | `reason`, `revokedSanctionIds`, `from`, `to` |
| `report.assign` | `previousAdminId`, `reportedUserId` |
| `report.resolve` | `action`, `note`, `reportedUserId`, `clearAutoHide`, `durationDays`, `sanctionId`, `sanctionAlreadyActive`, `matchesEnded` |
| `report.conversation_view` | `matchId`, `messagesShown` |

**Viewers:**

| Method | Path | Permission | Filters |
|---|---|---|---|
| GET | `/api/v1/admin/audit-logs` | `audit:view` | `action`, `targetType`, `targetId`, `adminId`, `cursor`, `limit` |
| GET | `/api/v1/admin/safety-logs` | `safety_logs:view` | `eventType`, `severity`, `userId`, `cursor`, `limit` |

Both are newest first and never return IP hashes. Admin UI: **Audit log** (`/audit-logs`) and **Safety logs** (`/safety-logs`).

## 8. Admin UI

- **Report detail** (`/reports/:id`): **Assign to me (start review)**, automated-flag banner and signals, evidence, sanction history, resolution form with all five actions, a duration picker for restrict/suspend, and a hint that disables banning until the report is assigned.
- **Member page** (`/users/:id`): a **Moderation** panel with Warn, Restrict chat / Lift, Suspend / Reactivate, Ban (browser confirmation), Lift ban (super admins), and the sanction history with notes, end dates, acknowledgements and lift reasons.

## 9. Edge cases

| Case | Behaviour |
|---|---|
| Accounts restricted or suspended before sanction records existed | Treated as active (conflict on re-apply, reuse when resolving a report); lifting works and simply finds no rows to revoke |
| Unban | Status `active`; ended matches, chats and cancelled interests are **not** restored |
| Lifting a suspension early | `reactivate` revokes the suspension (sets `revoked_at`); the expiry job ignores it |
| Two moderators act at once | The member row is locked (`FOR UPDATE`) and one active sanction per type is enforced by a unique index, so the second gets `409` |

## 10. Testing

See [moderation system §11](moderation-system.md#11-testing). The most relevant cases are in `apps/api/src/modules/safety/moderation.int.test.ts` under "warnings", "chat restriction", "suspension and ban" and "log viewers".
