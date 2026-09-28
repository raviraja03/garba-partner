# OTP Flow

> Related: [Authentication](authentication.md), [Session management](session-management.md), [User flows §2](../product/user-flows.md#2-authentication-flow)

## 1. Sequence

```mermaid
sequenceDiagram
    actor U as Member
    participant W as Web app
    participant A as API
    participant DB as PostgreSQL
    participant S as SMS provider

    U->>W: Enter mobile number
    W->>A: POST /auth/send-otp {phone}
    A->>A: Normalise to E.164, phone_hash = HMAC(PHONE_HASH_SECRET)
    A->>DB: BEGIN; pg_advisory_xact_lock(phone_hash)
    A->>DB: Check cooldown + per-phone + per-IP windows
    A->>DB: Invalidate previous active code
    A->>DB: INSERT otp_requests (otp_hash = HMAC(OTP_HMAC_SECRET, phone_hash:code))
    A->>DB: COMMIT
    A->>S: sendOtp(phone, code) (skipped for banned numbers)
    A-->>W: 200 {expiresInSeconds, resendAvailableInSeconds[, devOtp]}
    U->>W: Enter 6-digit code
    W->>A: POST /auth/verify-otp {phone, code}
    A->>DB: BEGIN; SELECT active code FOR UPDATE
    A->>A: Expired? attempts ≥ 5? constant-time compare
    A->>DB: Record attempt / consume code
    A->>DB: Find or create user; create session
    A->>DB: COMMIT
    A-->>W: 200 {accessToken, user} + Set-Cookie gp_rt
```

## 2. Rules

| Rule | Value | Source |
|---|---|---|
| Code | 6 digits from `crypto.randomInt` | `LIMITS.OTP_LENGTH` |
| Lifetime | 5 minutes | `LIMITS.OTP_TTL_SECONDS` |
| Attempts per code | 5, after which the code is invalidated | `LIMITS.OTP_MAX_ATTEMPTS` |
| Resend cooldown | 30 s per number | `LIMITS.OTP_RESEND_COOLDOWN_SECONDS` |
| Per number | 5 codes/hour, 10 codes/day | `LIMITS.OTP_MAX_PER_PHONE_PER_*` |
| Per IP | 20 codes/hour | `LIMITS.OTP_MAX_PER_IP_PER_HOUR` |
| Active codes | At most one per number. A new code invalidates the previous one (DB partial unique index) | `otp_requests_one_active_per_phone_unique` |
| Single use | A consumed code can never be used again | `consumed_at` |

Why 5 attempts × 5 codes/hour is enough: an attacker gets at most 25 guesses per hour against a 1,000,000-code space (≈ 0.0025% per hour), and every guess is logged against the number.

## 3. Storage and privacy

- `otp_requests` stores `phone_hash`, `otp_hash` (HMAC-SHA256 keyed with `OTP_HMAC_SECRET` over `phone_hash:code`), `attempts`, `expires_at`, `consumed_at`, `invalidated_at` and `ip_hash`. **The code and the phone number are never stored.**
- Codes are compared with `crypto.timingSafeEqual`.
- **Codes are never logged.** The logger has redaction paths for `otp`, `code`, `phone`, `password` and `token`, request bodies aren't logged, and the development provider logs nothing. The end-to-end check in this phase confirmed that neither the code nor the phone number appears in the API log.
- Wrong attempts are **persisted even though the request fails**: the verification transaction returns an outcome, and the error is thrown only after it commits.
- Rows are purged after 24 hours (scheduled job, worker phase).

## 4. Development OTP mechanism

| | Development | Staging / Production |
|---|---|---|
| `SMS_PROVIDER` | `dev` | a real provider (added before launch) |
| SMS sent | No | Yes |
| Code in `send-otp` response (`devOtp`) | **Yes**, shown on the OTP screen in a "Development only" banner | **Never** |
| Guards | — | 1. `loadServerEnv()` **refuses to start** with `SMS_PROVIDER=dev` unless `APP_ENV=development`. 2. The service only adds `devOtp` when the provider is the dev provider **and** `APP_ENV === 'development'`. 3. A test asserts `devOtp` is absent when a delivering provider is used, and another asserts the env guard |

The dev provider never writes the code to logs or files. The only place it appears is the HTTP response to the requester in local development.

## 5. Account handling at verification

| Account state | Result |
|---|---|
| No account | Created (`status = active`, onboarding incomplete) and logged in |
| `active` | Logged in |
| `suspended` / `pending_deletion` | Logged in. The app shows the status notice, and social features are blocked by `requireActiveMember` |
| `banned` | `403 ACCOUNT_BANNED`, no session. `send-otp` looks identical but sends no SMS |
| Soft-deleted (erased) | Phone data is gone, so the number starts a fresh account |

## 6. Edge cases

| Case | Behaviour |
|---|---|
| Two send-otp requests at once for one number | Serialised by `pg_advisory_xact_lock`. The second hits the cooldown (429) |
| Verify without ever requesting | `400 OTP_INVALID` ("request a new one") |
| Correct code after 5 wrong attempts | Rejected. The code was invalidated |
| Same code submitted twice concurrently | The row lock serialises them. The second finds no active code (400) |
| Resend while a code is active | The old code is invalidated, and only the newest code works |
| Clock | All timestamps come from the API server (`timestamptz`, UTC) |
