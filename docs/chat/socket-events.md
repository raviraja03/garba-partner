# Socket Events

> Related: [Chat architecture](architecture.md), [Chat safety](safety.md). Types: `packages/shared/src/types/socket.ts` (`ClientToServerEvents`, `ServerToClientEvents`, `SocketAck`).

## 1. Connection

| Setting | Value |
|---|---|
| URL | Same origin as the web app; path **`/socket.io`** |
| Transports | WebSocket, with long-polling fallback |
| CORS | `WEB_ORIGIN` only, credentials allowed |
| Max payload | 16 KB (`LIMITS.SOCKET_MAX_PAYLOAD_BYTES`) |
| Handshake auth | `auth: { token: <member access token> }` |

```ts
import { io } from 'socket.io-client';
const socket = io({
  path: '/socket.io',
  auth: (cb) => cb({ token: getAccessToken() }), // latest token on every reconnect
});
```

**Handshake checks** (same code as HTTP authentication, `resolveMemberSession()`): valid member JWT, session not revoked or expired, account **active** and onboarded. On success the socket joins room `user:{userId}`. The socket is closed automatically when the access token expires; the client refreshes the session over HTTP and reconnects.

`connect_error` codes (`error.message`):

| Code | When |
|---|---|
| `UNAUTHENTICATED` | Missing/invalid/expired token, revoked session, admin token, pending-deletion account |
| `ACCOUNT_SUSPENDED` | Suspended account |
| `ACCOUNT_BANNED` | Banned account |
| `ONBOARDING_REQUIRED` | No complete profile yet |

## 2. Client → server

Every event **must** pass an acknowledgement callback; events without one are ignored. Each event is:

1. rate-limited per socket (120 events/minute) and, for sends, per member across REST and socket (30 messages/minute);
2. checked against the **live** session and account (logout, suspension or ban take effect immediately; the socket is then told `session:ended` and disconnected);
3. validated with the shared schema (strict: unknown keys are rejected);
4. handled by the same `ChatService` as REST, which re-checks membership, match status, the partner's account and blocks.

Acknowledgement shape:

```ts
type SocketAck<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };
```

### `message:send`

```ts
socket.emitWithAck('message:send', {
  matchId: '5f0a…',
  clientMessageId: crypto.randomUUID(), // reuse the same ID when retrying
  body: 'See you at the gate at 8?',     // 1–1000 characters after trimming
});
// → { ok: true, data: MessageDto }
```

| Error code | Meaning |
|---|---|
| `NOT_FOUND` | Not a member of this chat (or no such chat) |
| `MATCH_NOT_ACTIVE` | The match ended, or the partner is unavailable/blocked |
| `VALIDATION_ERROR` | Empty/too long body, bad IDs, unknown keys. `message` holds the first field error |
| `RATE_LIMITED` | Too many messages/events |
| `CONFLICT` | The `clientMessageId` was already used for a different chat |
| `UNAUTHENTICATED` | Session ended (the socket is then disconnected) |

A retry with the same `clientMessageId` returns the stored message and is **not** delivered again.

### `message:read`

```ts
socket.emitWithAck('message:read', { matchId: '5f0a…', lastReadMessageId: 'c2b7…' });
// → { ok: true, data: { lastReadAt: '2026-10-11T13:05:42.118Z' } }
```

The message must belong to that chat (`NOT_FOUND` otherwise). Read positions only move forward.

## 3. Server → client

| Event | Payload | Sent to | When |
|---|---|---|---|
| `message:new` | `MessageDto` | Both members (all tabs, including the sender's other tabs) | A message is stored (socket or REST) |
| `message:read` | `{ matchId, userId, lastReadAt }` | The **other** member | Someone reads up to a message |
| `match:ended` | `{ matchId }` | Both members | Unmatch, block, report, moderator close, ban. **No reason is given** |
| `session:ended` | `{ reason: 'account_restricted' \| 'session_revoked' }` | The member | Just before the server disconnects them (suspension/ban, or a revoked session) |
| `notification:new` | `{ notification: NotificationDto, unreadCount }` | The recipient (all tabs) | A notification is created, or a chat's unread message notification is bumped ([notifications](../notifications/notifications.md#realtime)). Never contains message text |

All server events are emitted **after** the database transaction commits, so a client never sees a message that could still roll back.

`MessageDto`:

```json
{
  "id": "c2b7…",
  "matchId": "5f0a…",
  "senderId": "4b1e…",
  "clientMessageId": "8c1d…",
  "body": "See you at the gate at 8?",
  "createdAt": "2026-10-11T13:05:42.118Z"
}
```

Moderation fields (e.g. contact-detail detection) are never sent to members.

## 4. Client behaviour (web)

| Situation | Behaviour |
|---|---|
| `connect_error: UNAUTHENTICATED` or server-initiated disconnect | Refresh the session over HTTP, reconnect once |
| Socket disconnected while sending | Send over REST with the same `clientMessageId` |
| Ack timeout (8 s) | Fall back to REST with the same `clientMessageId` |
| `match:ended` | Refresh chats; the open chat shows "This chat is no longer available" |
| `session:ended` | Re-read the account (the app shows the suspended state) |
