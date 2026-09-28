# Profile Validation

> Related: [User profile](user-profile.md), [Privacy rules](privacy-rules.md)

Validation happens at three layers:

1. **Shared schemas** (`packages/shared/src/schemas/profile.schema.ts`, `zod/mini`). The web forms and the API use exactly the same rules. The API is authoritative.
2. **Service rules** that need the database or "today": the 18+ check, city/area existence, available-date ranges, and the stored age range.
3. **Database constraints**, which hold even if a bug bypasses layers 1–2 (see [schema](../database/schema.md)).

All objects are **strict**: unknown keys (e.g. `phone`, `status`, `dateOfBirth` on update) are rejected with `400 VALIDATION_ERROR`. Error `details` name the field (`path`) and give a user-facing `message`. Submitted values are never echoed back.

## 1. Field rules

| Field | Rule | Normalisation | Error message (examples) |
|---|---|---|---|
| `name` | 2–30 characters after normalisation. Letters in any script, spaces, `.`, `'` and `-`. Must start with a letter. **No digits or symbols** (stops phone numbers being hidden in names) | NFKC, invisible/control characters removed, whitespace collapsed and trimmed | "Name must be 2–30 characters.", "Use letters only (no numbers or symbols)." |
| `dateOfBirth` | Real calendar date `YYYY-MM-DD` (rejects `2026-02-30`). Age **≥ 18** today in **IST**, and ≤ 100. **Create only**, immutable afterwards | — | "Enter a valid date (YYYY-MM-DD).", `403 UNDERAGE` |
| `gender` | `woman` \| `man` \| `non_binary` | — | enum error |
| `cityId` | UUID of an **active** city | — | "Choose one of the available cities." |
| `areaId` | Optional. UUID of an **active** area **in the chosen city** (also enforced by a composite FK) | Changing the city without an area clears the area | "Choose an area in the selected city." |
| `bio` | Optional, ≤ 300 characters. **No phone numbers, emails or links** | NFKC, invisible characters removed, trimmed. Empty → `null` | "Please remove phone numbers, email addresses and links from your bio." |
| `instagramId` | Optional. Instagram username rules: `a–z 0–9 . _`, ≤ 30, no leading/trailing dot, no `..` | Leading `@` removed, lower-cased. Empty → `null` | "Enter a valid Instagram username…" |
| `garbaLevel` | `beginner` \| `intermediate` \| `advanced` | — | enum error |
| `availableDates` | Optional list, ≤ 30 dates, each a real date **from today (IST) to today + 365 days**, no duplicates | Sorted ascending, de-duplicated. Past dates are hidden when read | "Available dates cannot be in the past.", "…within the next 12 months." |
| `confirmsAdult` | Must be `true` (create) | — | "Please confirm that you are 18 or older." |
| `acceptTerms` | Must be `true` (create). Stores `users.terms_version` and `terms_accepted_at` | — | "Please accept the Terms and Privacy Policy." |

### Contact-detail detection (bio)

`looksLikeContactInfo()` (`packages/shared/src/utils/text.ts`) flags:

- **phone-like numbers:** 8 or more digits, possibly separated by spaces, `-`, `.`, `()`;
- **email addresses;**
- **links:** `http(s)://…`, `www.…`, and common domain endings (`.com`, `.in`, `.me`, `.link`, …).

Ordinary text such as "Dancing since 2005" or "Navratri 9 nights" passes. The web form shows the warning while the member types.

## 2. Age rules (18+)

- Age = completed years between `dateOfBirth` and **today in Asia/Kolkata** (`todayInIndia()`, `calculateAge()`). A member born 18 years ago today is accepted, one day later is rejected.
- **Under 18:** `403 UNDERAGE` **and** `users.underage_rejected_at` is set in the same committed transaction, even though the request fails. Every later profile creation returns `UNDERAGE`, so trying another date doesn't work. Clearing the lock is a support action.
- The date picker's `max` is the latest date that is 18+ today, but the server decides.
- The date of birth can't be changed through the API (`PATCH` rejects the key).

## 3. Preferences rules

| Field | Rule |
|---|---|
| `preferredGender` | `women` \| `men` \| `everyone` |
| `minAge`, `maxAge` | Integers 18–80. `minAge ≤ maxAge`, checked in the request **and** against the stored value when only one side is sent. The DB CHECK enforces it too |
| `verifiedOnly`, `discoveryEnabled`, `showArea` | Booleans |

## 4. Image rules

| Rule | Where |
|---|---|
| Declared type `image/jpeg`, `image/png` or `image/webp` | Upload middleware (first filter) |
| ≤ 5 MB | Upload middleware (`413 PAYLOAD_TOO_LARGE`) |
| **Decodes** as JPEG, PNG or WebP (the extension and Content-Type are never trusted) | `processProfileImage()` |
| ≥ 400×400 and ≤ 8000×8000 after orientation. Decompression bombs are refused (`limitInputPixels`) | `processProfileImage()` |
| One file per request, field name `image`, no other fields | Upload middleware |
| 20 uploads per member per hour | Rate limiter |

See [cloudinary.md](cloudinary.md) for what happens to a valid image.

## 5. Database backstops

| Constraint | Guarantees |
|---|---|
| `user_profiles_display_name_check` | 2–30 characters |
| `user_profiles_date_of_birth_check` | ≥ 1900-01-01 |
| `user_profiles_gender_check`, `user_profiles_garba_level_check` | Enumerations |
| `user_profiles_area_in_city_fkey` (composite FK) | The area belongs to the profile's city |
| `user_profiles_instagram_handle_check` | `^[a-z0-9._]{1,30}$` |
| `user_profiles_available_dates_check` | ≤ 30 dates |
| `user_profiles_image_consistency_check` | Image columns are all set or all null |
| `user_preferences_age_range_check` | 18 ≤ min ≤ max ≤ 80 |
