# Sign-in flow (phone number + SMS code)

> Related: [Firebase Phone Authentication](firebase-phone-auth.md) (setup, API, security, troubleshooting), [Authentication](authentication.md), [Session management](session-management.md)

Members sign in with their mobile number and a 6-digit code sent by SMS. **Firebase Phone Authentication** sends and checks the code; our API then verifies Firebase's proof and starts the session. This page is the short version: the full description is in the [Firebase guide](firebase-phone-auth.md).

> This replaced the earlier flow in which the API generated the code and sent it on WhatsApp (and, before that, by SMS through MSG91). That code was removed. WhatsApp is still used for [notifications](../notifications/meta-whatsapp.md).

## 1. Steps

1. **Phone screen** (`/login`). The member enters an Indian mobile number. It is validated and converted to `+91…`.
2. **Security check.** Google reCAPTCHA runs, usually without the member seeing anything.
3. **Code sent.** Firebase sends a 6-digit code by SMS.
4. **Code screen** (`/login/verify`). The member enters the code. Firebase checks it and gives the browser a signed ID token.
5. **Exchange.** The browser posts only that token to `POST /api/v1/auth/phone`. The API verifies it ([what is checked](firebase-phone-auth.md#4-what-the-api-checks)), finds or creates the account by phone number, and returns the access token and the `gp_rt` refresh cookie.
6. The browser signs out of Firebase. From here on everything is the existing session ([session management](session-management.md)).

There is one flow for sign-up and login: a number that has never been seen creates an account.

## 2. Rules

| Rule | Value | Enforced by |
|---|---|---|
| Code length | 6 digits (`LIMITS.OTP_LENGTH`) | Firebase |
| Code lifetime, wrong-attempt limit, sends per number | Firebase's own limits | Firebase |
| Resend | Available 30 s after a send (`LIMITS.OTP_RESEND_COOLDOWN_SECONDS`); only the newest code works | Web app + Firebase |
| Supported numbers | Indian mobile numbers (+91) | Web app, and again by the API |
| Proof must be fresh | The code must have been verified at most 5 minutes before the exchange (`LIMITS.PHONE_TOKEN_MAX_AGE_SECONDS`) | API |
| Exchanges per IP | 30 per 15 minutes (`LIMITS.PHONE_LOGINS_PER_IP_PER_15_MIN`) | API |

## 3. What our API no longer does

- It does not generate, store, send or compare login codes. It never sees one.
- The `otp_requests` table is no longer written or read (it is kept; see [schema](../database/schema.md)).
- `POST /auth/send-otp` and `POST /auth/verify-otp` are gone (404).

## 4. Development

There is no on-screen development code and no bypass: the API always requires a real Firebase token. For local work, add a **test phone number** in the Firebase console and sign in with it and its fixed code; no SMS is sent ([guide §7](firebase-phone-auth.md#7-local-development)).

Automated tests replace Firebase with a stand-in and never send an SMS ([guide §13](firebase-phone-auth.md#13-testing)).

## 5. Messages the member can see

| Situation | Message |
|---|---|
| Not a valid Indian mobile number | Enter a valid 10-digit Indian mobile number. |
| Wrong code | That code is not correct. Please check it and try again. |
| Code expired, or an older code after a resend | This code has expired. Please request a new one. |
| Too many attempts | Too many attempts. Please wait a while and try again. |
| reCAPTCHA failed, blocked or dismissed | The security check did not complete. Turn off any content blocker for this site and try again. |
| No connection | Check your internet connection and try again. |
| A set-up problem on our side | Sign-in is unavailable right now. Please try again later. (Code: …) |
| The API refused the proof | We could not verify your phone number. Please request a new code. |
| Banned account | The existing `ACCOUNT_BANNED` message |

Firebase's own error objects are never shown ([troubleshooting](firebase-phone-auth.md#11-troubleshooting)).
