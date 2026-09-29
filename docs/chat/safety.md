# Chat Safety

> Related: [Chat architecture](architecture.md), [Moderation](moderation.md), [Discovery privacy](../matching/privacy.md), [Security architecture](../architecture/security-architecture.md)

## 1. Who can chat

Chat is **consent-first**: it exists only between two members who both said yes (an active match).

| Never allowed | Enforced by |
|---|---|
| Unmatched members chatting | Every call loads the match with the caller as a member and requires `status = 'active'`. Non-members get `404`; ended matches `409 MATCH_NOT_ACTIVE` |
| Blocked members chatting | A block ends the match under the pair lock and emits `match:ended`; every call also re-checks `blocks` in both directions |
| Suspended/banned members chatting | REST: `requireActiveMember`. Sockets: active members only at connect, live session/account check on every event, immediate disconnect on suspension/ban. The partner must be active too, so a suspended member's chats are hidden and closed to their partners |
| Logged-out sessions chatting | The socket's session is re-checked on every event; a revoked session gets `UNAUTHENTICATED` and is disconnected |

Tests cover each rule over **both** REST and Socket.IO ([architecture §9](architecture.md#9-testing)).

## 2. Block and report, everywhere

- The chat screen has **Block** and **Report** for the member, and **Report** on every message from the other person.
- Blocking or reporting ends the chat for **both** members immediately (`match:ended`). The other member is never told why, or who reported.
- A reported message is kept as evidence even if the chat is later deleted ([moderation §2](moderation.md#2-reporting-a-message-member)).

## 3. Contact-sharing nudge

Before a message that looks like a **phone number, email, link or UPI ID** is sent, the sender sees a non-blocking prompt: "Sharing contact or payment details? Only share with people you trust…" with **Send anyway**. The server doesn't block such messages (adults may choose to share) but records `contains_contact_info = true` on the message as **moderation context only**; it is never shown to members and appears to moderators only in report evidence.

## 4. Abuse controls

| Control | Limit |
|---|---|
| Messages | 30 per minute per member, shared by socket and REST (`LIMITS.MESSAGES_PER_MINUTE`) |
| Socket events | 120 per minute per socket |
| Payload size | 16 KB per socket message; message body 1–1000 characters |
| Idempotency | `UNIQUE (sender_id, client_message_id)`: retries never duplicate |
| Reports | 10 per day per member |
| Content | Plain text only: invisible/control characters removed, rendered with `white-space: pre-wrap`, never as HTML, no auto-linking |

## 5. Retention

- Messages are **immutable** (no edits; a database trigger rejects updates).
- Messages of an **active** match are kept while it is active.
- When a match ends, its messages are no longer accessible to members. The design target is to purge them **90 days** after the match ended ([security architecture §9](../architecture/security-architecture.md)); the `matches (ended_at)` index is in place, and the purge job is scheduled in the hardening phase.
- Report evidence snapshots are kept with the report, independent of the chat.
- Deleting an account deletes its messages (`ON DELETE CASCADE`); report snapshots remain.

## 6. Privacy

- Members see only the partner's public profile, message text and timestamps, and "Seen". There is no online status, last-seen time or typing indicator.
- Message bodies are never logged by the API (logs contain IDs and error codes only).
- Moderators see messages only through reports ([moderation §1](moderation.md#1-principle-no-chat-browsing)).
- Access tokens live in memory in the browser and are sent in the socket handshake; nothing is stored in `localStorage`.

## 7. Safety copy

- A pinned card at the top of every chat: "Meet at the event or another busy public place. Tell a friend your plans. Never send money or share OTPs."
- Match screen: keep conversations on the platform until you trust someone; meet at the event.
- Report form: "If you are in danger right now, call 112."

## 8. Checklist for changes to chat

- [ ] New client events: shared schema (strict), acknowledgement, go through `handle()` (rate limit + live session check), call the service (never the model directly).
- [ ] New ways a match can end must call `emitMatchEnded()` after commit.
- [ ] New sanctions must call `hub.disconnectUser()` after commit.
- [ ] Never return `contains_contact_info` or other moderation data to members.
- [ ] Update these documents and the socket/REST tests.
