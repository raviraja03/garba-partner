# Test Cases

> Related: [Testing strategy](testing-strategy.md), [Security testing](security-testing.md), [Release checklist](release-checklist.md)

Key test cases per area. **Auto** = automated in the named suite (under `apps/api/src/` unless stated). **Manual** = run by a person before a release ([release checklist](release-checklist.md)); these need a browser or a real provider. Expected results describe the API and, where relevant, what the web or admin app shows.

## Authentication

| ID | Case | Expected | Type |
|---|---|---|---|
| AUTH-01 | Send OTP to a valid Indian number | `200`, same response for new and existing numbers; dev only: `devOtp` | Auto `auth.int.test.ts` |
| AUTH-02 | Verify with the right code | Access token + `HttpOnly SameSite=Strict` refresh cookie; account created on first login | Auto |
| AUTH-03 | Wrong code 5 times, then the right one | `OTP_ATTEMPTS_EXCEEDED`; the code is burnt | Auto `auth`, `security` |
| AUTH-04 | OTP resend cooldown and hourly/daily per-phone limits, even from rotating IPs | `429` | Auto `auth`, `security` |
| AUTH-05 | Refresh rotates the token; reuse of a rotated token after the grace window | New token; reuse revokes the session | Auto |
| AUTH-06 | Refresh without the CSRF header / from a foreign origin | `403` | Auto `security` |
| AUTH-07 | Logout, then use the old access token | `401` | Auto `security` |
| AUTH-08 | Forged/expired/`alg:none`/tampered/wrong-audience JWT | `401` | Auto `security`, `token.service.test.ts` |
| AUTH-09 | Banned member signs in | `ACCOUNT_BANNED`; no SMS sent | Auto |
| AUTH-10 | Admin login: wrong password ×5 → lock; unknown email | `ACCOUNT_LOCKED`; same `INVALID_CREDENTIALS` for unknown email | Auto `admin-auth.int.test.ts` |
| AUTH-11 | Admin idle > 30 min then refresh | Session revoked (`idle_timeout`) | Auto |
| AUTH-12 | Session refresh records activity at most once an hour | `last_active_at` updated/not updated | Auto |
| AUTH-13 | Sign in on the web on a phone-width screen, refresh the page, stay signed in | Silent refresh; no token in local storage | Manual |
| AUTH-14 | Admin correct password only | A challenge, no session and no cookie | Auto `admin-auth.int.test.ts` |
| AUTH-15 | Admin first sign-in: enrol authenticator, wrong code, right code | Secret stored encrypted; session only after a valid code; `admin.totp_enrolled` + `admin.login` audited | Auto `admin-auth.int.test.ts` |
| AUTH-16 | Admin code replayed; expired challenge; 5 wrong codes | `MFA_CODE_INVALID`; `MFA_CHALLENGE_INVALID`; lockout audited | Auto `admin-auth.int.test.ts` |
| AUTH-17 | 2FA reset: moderator, self, another super admin | `403`, `403`, `200` + target's sessions revoked + audited | Auto `security` |
| AUTH-18 | Admin panel sign-in with a real authenticator app (enrol, sign out, sign in again) | Codes accepted; "open in authenticator app" link works on mobile | Manual |

## Profile and verification

| ID | Case | Expected | Type |
|---|---|---|---|
| PROF-01 | Create a profile under 18 | Rejected (`UNDERAGE`), account flagged | Auto `profile.int.test.ts` |
| PROF-02 | Contact details (phone/email/links) in bio or name | `400` | Auto |
| PROF-03 | Upload a valid photo | EXIF/GPS stripped, stored, thumbnail URL returned | Auto `profile`, `image.test.ts` |
| PROF-04 | Upload abuse (non-image, SVG, bomb, >10 MB, 2 files) | `400`/`413` | Auto `security` |
| PROF-05 | Change photo of a photo-verified member | Badge revoked, verification `revoked` | Auto |
| PROF-06 | Public profile: only allow-listed fields (no phone, DOB, Instagram, status) | Allow-list only | Auto |
| PROF-07 | Public profile of a member who paused discovery / is hidden / was reported | `404` unless connected (match/pending interest) | Auto `security` SEC-01, `profile` |
| PROF-08 | Mass assignment (`status`, `photoVerifiedAt`, `role`) | `400` | Auto `security` |
| VER-01 | Verified-only discovery filter | Only photo/identity-verified members | Auto `discovery.int.test.ts` |
| VER-02 | Verification copy never promises safety | Web: "not a guarantee of identity or safety" on event, safety and guideline pages | Manual |

## Events

| ID | Case | Expected | Type |
|---|---|---|---|
| EVT-01 | Public list: filters (city, date presets), sorting, pagination; drafts/archived hidden | Correct items; stable cursor | Auto `events.int.test.ts` |
| EVT-02 | Organizer private contact never in public responses | Absent | Auto |
| EVT-03 | Admin create/publish/verify/archive/delete (never-published only) | Status rules, audit entries | Auto `admin-events`, `admin-organizers` |
| EVT-04 | Event manager vs moderator permissions | Moderator view only | Auto |
| EVT-05 | Attendance on draft / ended events | `404` / `EVENT_NOT_OPEN` | Auto `attendance.int.test.ts` |
| EVT-06 | `javascript:` / `data:` URLs for ticket/website | `400` | Auto `security`, `shared/event.test.ts` |

## Discovery

| ID | Case | Expected | Type |
|---|---|---|---|
| DSC-01 | Excludes blocked, reported (both ways), suspended, hidden, paused, restricted, mismatched preferences, declined within cooldown | Never listed | Auto `discovery.int.test.ts` |
| DSC-02 | Filters (event, date, level, city, verified) and ranking without a score | Correct order; no score exposed | Auto `discovery`, `matching.test.ts` |
| DSC-03 | `/partners/:id` of an ineligible member | `404` | Auto |
| DSC-04 | Invalid filters (`date` injection, bad cursor) | `400` | Auto `security` |

## Interests and matches

| ID | Case | Expected | Type |
|---|---|---|---|
| INT-01 | Send, accept, reject, withdraw; daily limit 25 | Correct states; `429` over limit | Auto `interests.int.test.ts` |
| INT-02 | Mutual interest | Exactly one match (DB unique index) | Auto `constraints.int.test.ts` |
| INT-03 | Concurrent sends/accepts | No duplicate interests or matches | Auto |
| INT-04 | Interest to self / to a blocked / restricted member | `400` / `USER_UNAVAILABLE` / `INTERACTIONS_RESTRICTED` | Auto |
| MAT-01 | Unmatch; stranger unmatches someone else's match | Ended for both / `404` | Auto `interests`, `security` |
| MAT-02 | Admin close match / restrict interactions | Audited; effects applied | Auto `admin-matches.int.test.ts` |

## Chat

| ID | Case | Expected | Type |
|---|---|---|---|
| CHT-01 | Send/receive live over Socket.IO and REST fallback; idempotent retries | Delivered once to all tabs | Auto `socket.int.test.ts`, `chat.int.test.ts` |
| CHT-02 | Non-member reads/sends/marks read | `404` | Auto `chat`, `security` |
| CHT-03 | After block, unmatch, suspension, ban | Sends refused; socket gets `match:ended` / `session:ended` | Auto |
| CHT-04 | Chat restriction | `403 CHAT_RESTRICTED` (REST and socket), reading still works | Auto `moderation`, `socket` |
| CHT-05 | XSS payload in a message | Stored/returned as text; rendered as text | Auto `security` + Manual (render check) |
| CHT-06 | Money request / contact details | Nudges for sender, warning for recipient, never blocked | Auto `shared/safety.test.ts` + Manual |
| CHT-07 | 31 messages in a minute | `429` | Auto |

## Block and report

| ID | Case | Expected | Type |
|---|---|---|---|
| BLK-01 | Block ends match and pending interests, hides both ways, is silent | As described; notifications between them removed | Auto `safety`, `notifications` |
| BLK-02 | Unblock restores nothing; rate-limited | Idempotent; `safety.block_removed` logged | Auto `moderation` |
| RPT-01 | Report user/message with each product reason; retired reasons rejected | `201`; old reasons `400` | Auto `moderation` |
| RPT-02 | Message evidence snapshot survives unmatch | Snapshot kept | Auto `chat` |
| RPT-03 | Report someone else's message | `404` | Auto `security` |
| RPT-04 | P0 report / 3 reporters | Hidden from discovery, **never** suspended or banned | Auto `moderation` |
| RPT-05 | Admin resolve: warn, restrict chat, suspend (timed), ban (only after review) | Sanctions, audit, notifications | Auto `moderation`, `admin-reports` |

## Notifications

| ID | Case | Expected | Type |
|---|---|---|---|
| NTF-01 | Interest received/accepted, match, new message (collapsed), event reminder, safety, booking | Created once, correct link, no message text | Auto `notifications.int.test.ts` |
| NTF-02 | Mark one/all read; another member's notification | Read; `404` | Auto `notifications`, `security` |
| NTF-03 | Preferences off; safety/booking can't be turned off | Not created; `400` | Auto |
| NTF-04 | Live `notification:new` with unread count | Pushed | Auto `socket` |
| NTF-05 | Bell badge updates live on the web | Badge count changes without reload | Manual |

## Payments

| ID | Case | Expected | Type |
|---|---|---|---|
| PAY-01 | Create order: server-computed amount, idempotency key, capacity hold | Correct amount; same order on retry; `SOLD_OUT` when full | Auto `payments.int.test.ts` |
| PAY-02 | Client-sent amount / forged signature / another member's order | `400` / `400` / `404` | Auto |
| PAY-03 | Failed payment then retry | No booking, then booking | Auto |
| PAY-04 | Webhook: valid, duplicate, tampered, unsigned, out-of-order | Booked once; `401` for bad signatures | Auto |
| PAY-05 | Late payment when sold out; duplicate payment | Auto refund | Auto |
| PAY-06 | Admin refund (super admin only), refund failure + retry, refund webhook | Correct states, audit | Auto |
| PAY-07 | Full purchase in Razorpay **Test Mode** with UPI `success@razorpay` and `failure@razorpay`, incl. closing the tab after paying | Booking via webhook; failure message and retry | **Manual** (needs test keys) |

## Admin permissions and dashboard

| ID | Case | Expected | Type |
|---|---|---|---|
| ADM-01 | Every admin endpoint without a token / with a member token | `401` | Auto `security` |
| ADM-02 | Role × permission matrix (super admin, moderator, event manager) | `403` where not allowed | Auto `security`, per-module suites |
| ADM-03 | Dashboard sections and chart series per role; export only with `payments:view` | Sections `null` / `403` | Auto `admin-dashboard.int.test.ts` |
| ADM-04 | Dashboard metrics with date/city filters | Correct aggregates, no member data | Auto |
| ADM-05 | CSV export: formula neutralisation, audit | `'=` prefixed; `dashboard.export` logged | Auto |
| ADM-06 | Audit and safety log viewers; no IP hashes | Super admin / moderator only | Auto `moderation` |
| ADM-07 | Admin UI hides sections the role lacks (navigation, buttons) | Hidden (API enforces anyway) | Manual |

## Cross-cutting

| ID | Case | Expected | Type |
|---|---|---|---|
| X-01 | Injection strings in every search/filter/path param | No `5xx`, no data leak | Auto `security` |
| X-02 | Oversized/malformed JSON, prototype pollution | `413` / `400` | Auto `security` |
| X-03 | Error responses: no stack traces; security headers | As expected | Auto `security`, `app.test.ts` |
| X-04 | Phone numbers, tokens and OTPs never in logs | Redacted | Auto `security` SEC-02 |
| X-05 | Keyboard navigation and screen-reader labels on sign-in, discovery, chat, checkout | Usable | Manual |
| X-06 | Mobile layout (360 px) of every member page | No horizontal scroll, tap targets ≥ 44 px | Manual |
