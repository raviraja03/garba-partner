# User Profile

> Related: [Profile validation](profile-validation.md), [Cloudinary](cloudinary.md), [Privacy rules](privacy-rules.md), [Authorization](../auth/authorization.md), [Schema](../database/schema.md)

## 1. Overview

Every member has one profile (`user_profiles`) and one set of preferences (`user_preferences`). Both are created together during onboarding. The profile is what other members see, through a strict allow-list ([privacy rules](privacy-rules.md)). The preferences describe who the member wants to dance with and control their visibility.

| Profile field | API name | Stored in | Visible to others |
|---|---|---|---|
| Name | `name` | `user_profiles.display_name` | ✅ |
| Date of birth | `dateOfBirth` | `user_profiles.date_of_birth` | ❌ (only `age`) |
| Gender | `gender` | `user_profiles.gender` | ✅ |
| Instagram ID | `instagramId` | `user_profiles.instagram_handle` | ❌ **private** |
| City | `cityId` → `city` | `user_profiles.city_id` → `cities` | ✅ (name only) |
| Area | `areaId` → `area` | `user_profiles.area_id` → `areas` | Only if `showArea` is on |
| Bio | `bio` | `user_profiles.bio` | ✅ |
| Profile image | `image` | `user_profiles.image_public_id` (+ Cloudinary) | ✅ |
| Garba level | `garbaLevel` | `user_profiles.garba_level` | ✅ |
| Available dates | `availableDates` | `user_profiles.available_dates` (`date[]`) | ✅ (upcoming only) |

| Preference | API name | Stored in | Default |
|---|---|---|---|
| Preferred gender | `preferredGender` | `user_preferences.partner_gender_preference` | `everyone` |
| Minimum age | `minAge` | `user_preferences.age_min` | 18 |
| Maximum age | `maxAge` | `user_preferences.age_max` | 80 |
| Verified only | `verifiedOnly` | `user_preferences.verified_only` | `false` |
| Discoverable | `discoveryEnabled` | `user_preferences.discovery_enabled` | `false` (opt-in) |
| Show area | `showArea` | `user_preferences.show_area` | `false` (opt-in) |

Preferences are stored now and will be applied by matching and discovery (a later phase). **Matching isn't implemented yet.**

### Code map

| Concern | File |
|---|---|
| Routes / controller / service | `apps/api/src/modules/profiles/profile.{routes,controller,service}.ts` |
| Allow-list DTO mappers, completion | `apps/api/src/modules/profiles/profile.mapper.ts` |
| Cities & areas | `apps/api/src/modules/locations/` |
| Image validation + EXIF stripping | `apps/api/src/lib/image.ts`, `apps/api/src/middlewares/upload.ts` |
| Storage providers | `apps/api/src/providers/media/` |
| Admin user management | `apps/api/src/modules/admin/users/`, `apps/api/src/modules/admin/audit/` |
| Shared schemas, completion, dates | `packages/shared/src/{schemas/profile.schema,utils/profile-completion,utils/dates}.ts` |
| Web onboarding / profile pages | `apps/web/src/pages/{Onboarding,Profile,EditProfile,Preferences}Page.tsx`, `apps/web/src/features/profile/` |
| Admin user pages | `apps/admin/src/pages/{Users,UserDetail}Page.tsx`, `apps/admin/src/features/users/` |

## 2. Profile status and completion

### Profile status (computed, never stored)

| `profileStatus` | Meaning |
|---|---|
| `not_started` | No profile yet. The web app sends the member to onboarding |
| `incomplete` | A required field is missing (in practice, the photo) |
| `complete` | All required fields are present. The profile can be shown to other members |

Required fields: name, date of birth, gender, city, garba level, **profile image**.

The first time a profile becomes `complete`, `users.onboarding_completed_at` is set. This is what `requireActiveMember` checks before a member can view other profiles. It stays set if the photo is later removed, but the public profile is then hidden again because it's no longer complete.

Account status is separate (`active`, `suspended`, `banned`, `pending_deletion`) and is returned as `accountStatus`.

### Completion percentage

Defined once in `packages/shared/src/utils/profile-completion.ts` (the web and the API use the same code):

| Field | Weight | Required |
|---|---:|:-:|
| Name | 10 | ✅ |
| Date of birth | 10 | ✅ |
| Gender | 10 | ✅ |
| City | 10 | ✅ |
| Garba level | 10 | ✅ |
| Profile image | 20 | ✅ |
| Bio | 10 | |
| Available dates (at least one upcoming) | 10 | |
| Area | 5 | |
| Instagram ID | 5 | |
| **Total** | **100** | |

The response lists `missingRequired` and `missingOptional`, so the UI can tell the member what to add.

## 3. Member API

All endpoints use the standard envelope. `/me/*` endpoints require `Authorization: Bearer <member access token>` and an account that is `active` or `suspended` (suspended members may fix their own profile). `pending_deletion` gets `403 ACCOUNT_PENDING_DELETION`.

### 3.1 `GET /api/v1/me/profile`

Returns the member's own profile, including private fields.

**200 OK**

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "profileStatus": "complete",
    "completion": { "percentage": 100, "status": "complete", "missingRequired": [], "missingOptional": [] },
    "accountStatus": "active",
    "photoVerified": false,
    "profile": {
      "name": "Priya",
      "dateOfBirth": "2000-03-14",
      "age": 26,
      "gender": "woman",
      "city": { "id": "c1000000-0000-4000-8000-000000000001", "name": "Ahmedabad", "state": "Gujarat" },
      "area": { "id": "a2000000-0001-4000-8000-000000000001", "cityId": "c1000000-0000-4000-8000-000000000001", "name": "Navrangpura" },
      "bio": "Dancing since school.",
      "instagramId": "priya.garba",
      "garbaLevel": "advanced",
      "availableDates": ["2026-10-01", "2026-10-08"],
      "image": {
        "url": "https://res.cloudinary.com/<cloud>/image/upload/c_fill,g_face,h_800,w_600/f_auto,q_auto/garba-partner/production/profile-images/<random>",
        "thumbnailUrl": "https://res.cloudinary.com/<cloud>/image/upload/c_fill,g_face,h_160,w_160/f_auto,q_auto/…"
      },
      "updatedAt": "2026-09-28T08:20:33.000Z"
    },
    "preferences": {
      "preferredGender": "everyone",
      "minAge": 18,
      "maxAge": 80,
      "verifiedOnly": false,
      "discoveryEnabled": false,
      "showArea": false
    }
  }
}
```

Before onboarding: `profileStatus: "not_started"`, `profile: null`, `preferences: null`, `completion.percentage: 0`. Past `availableDates` are never returned.

### 3.2 `POST /api/v1/me/profile`

Creates the profile (onboarding step 1) and the default preferences, and records acceptance of the current terms version.

**Request**

```json
{
  "name": "Priya",
  "dateOfBirth": "2000-03-14",
  "gender": "woman",
  "cityId": "c1000000-0000-4000-8000-000000000001",
  "areaId": "a2000000-0001-4000-8000-000000000001",
  "bio": "Dancing since school.",
  "instagramId": "@Priya.Garba",
  "garbaLevel": "advanced",
  "availableDates": ["2026-10-08", "2026-10-01"],
  "confirmsAdult": true,
  "acceptTerms": true
}
```

`areaId`, `bio`, `instagramId` and `availableDates` are optional. **201 Created**: same shape as `GET /me/profile` (`profileStatus: "incomplete"` until a photo is uploaded).

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Any field rule fails ([profile validation](profile-validation.md)). `details[].path` names the field |
| 403 | `UNDERAGE` | Age < 18 in IST today. **The date of birth is then locked**: later attempts also get `UNDERAGE` (`users.underage_rejected_at`) |
| 409 | `CONFLICT` | A profile already exists |

### 3.3 `PATCH /api/v1/me/profile`

Partial update. Accepts `name`, `gender`, `cityId`, `areaId`, `bio`, `instagramId`, `garbaLevel` and `availableDates`. **`dateOfBirth` can't be changed** (the key is rejected with `400`). Changing `cityId` without `areaId` clears the area. `bio: ""` / `instagramId: ""` clear those fields.

**200 OK**: `MyProfileDto`. **Errors:** `400 VALIDATION_ERROR`, `409 PROFILE_NOT_STARTED`.

### 3.4 `PUT /api/v1/me/preferences`

Partial update of preferences: `{ preferredGender?, minAge?, maxAge?, verifiedOnly?, discoveryEnabled?, showArea? }`. The age range is checked against the stored values too, so `minAge ≤ maxAge` always holds.

**200 OK**: `MyProfileDto`. **Errors:** `400 VALIDATION_ERROR`, `409 PROFILE_NOT_STARTED`.

### 3.5 `POST /api/v1/me/profile/image`

`multipart/form-data` with exactly one file in the field **`image`**. It replaces the current photo.

```bash
curl -X POST http://localhost:5173/api/v1/me/profile/image \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@selfie.jpg;type=image/jpeg"
```

Processing: decoded and verified → metadata (EXIF/GPS) removed → resized → stored ([cloudinary.md](cloudinary.md)). If the member was photo-verified, the badge is **revoked**, because the verified photo is gone.

**200 OK**: `MyProfileDto` (with `profile.image`).

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_IMAGE` | Not a real JPEG/PNG/WebP, smaller than 400×400, larger than 8000 px, or an unsupported declared type |
| 400 | `VALIDATION_ERROR` | No file, or a file in the wrong field |
| 409 | `PROFILE_NOT_STARTED` | No profile yet |
| 413 | `PAYLOAD_TOO_LARGE` | File > 5 MB |
| 429 | `RATE_LIMITED` | More than 20 uploads per member per hour |
| 503 | `SERVICE_UNAVAILABLE` | Storage failed. The profile is unchanged |

### 3.6 `DELETE /api/v1/me/profile/image`

Removes the photo (the profile becomes `incomplete`) and revokes the photo-verified badge. **200 OK**: `MyProfileDto`.

### 3.7 `GET /api/v1/me/profile/preview`

Returns the member's own profile **exactly as other members would see it** (`PublicProfileDto`), even while incomplete. **409 `PROFILE_NOT_STARTED`** without a profile.

### 3.8 `GET /api/v1/users/:userId/profile` (public profile)

Requires an **active, onboarded** viewer (`authenticateMember` + `requireActiveMember`).

**200 OK**

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "0b7c…",
    "name": "Rohan",
    "age": 29,
    "gender": "man",
    "city": { "id": "c1000000-0000-4000-8000-000000000001", "name": "Ahmedabad" },
    "area": null,
    "bio": "Competition dancer.",
    "garbaLevel": "advanced",
    "availableDates": ["2026-10-03"],
    "image": { "url": "…", "thumbnailUrl": "…" },
    "photoVerified": true
  }
}
```

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `userId` isn't a UUID |
| 401 | `UNAUTHENTICATED` | No/invalid token |
| 403 | `ONBOARDING_REQUIRED` / `ACCOUNT_SUSPENDED` / … | The **viewer** isn't active and onboarded |
| 404 | `NOT_FOUND` | Unknown user, **or** the target isn't active, is soft-deleted, or has an incomplete profile. All of these look identical |

When blocking is implemented, blocked pairs will also get `404` (interaction gate, [security architecture §5](../architecture/security-architecture.md#5-authorization-and-the-interaction-gate)).

### 3.9 `GET /api/v1/cities` and `GET /api/v1/cities/:cityId/areas`

Public reference data (cached for 5 minutes). Cities: `[{ id, name, state }]`. Areas: `[{ id, cityId, name }]`. Unknown or inactive city → `404`.

Launch cities (seeded by migration, fixed IDs): Ahmedabad, Vadodara, Surat, Mumbai, Pune, Bengaluru, each with 5–6 neighbourhood areas.

## 4. Admin API

All admin endpoints require an admin access token. Permissions follow [authorization §3](../auth/authorization.md#3-admin-roles-and-permissions).

### 4.1 `GET /api/v1/admin/users` (`users:view`)

Query: `q` (name substring, Indian mobile number, or user UUID), `status` (`active` | `suspended` | `banned` | `pending_deletion`), `cursor`, `limit` (1–50, default 20). Newest first.

A phone-number search is matched against the **HMAC** (`users.phone_hash`). The number is never stored, logged or returned.

**200 OK**

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "…",
      "name": "Kavya",
      "accountStatus": "active",
      "profileStatus": "complete",
      "completionPercentage": 75,
      "photoVerified": false,
      "city": "Ahmedabad",
      "thumbnailUrl": "…",
      "createdAt": "2026-09-28T08:00:00.000Z",
      "lastActiveAt": "2026-09-28T08:00:00.000Z"
    }
  ],
  "meta": { "nextCursor": "eyJjcmVhdGVkQXQiOi…" }
}
```

### 4.2 `GET /api/v1/admin/users/:userId` (`users:view`)

`AdminUserDetailDto`: account status and dates, profile status and completion, the private profile fields (DOB, Instagram) for moderation, preferences, active session count, and the last 10 verifications. **No phone number.** Revealing it is a separate super-admin action with a stated reason, which isn't built yet.

### 4.3 `POST /api/v1/admin/users/:userId/suspend` (`users:sanction`)

```json
{ "reason": "Harassment reported by two members" }
```

`reason` must be 5–500 characters. In one transaction: `users.status = 'suspended'`, **every session revoked** (`revoked_reason = 'sanction'`), and an `admin_audit_logs` entry (`user.suspend`, with the reason). The member's tokens stop working immediately, and their public profile returns `404`. Only `active` accounts can be suspended (`409 CONFLICT` otherwise).

A suspended member can still log in, see their status, and edit their own profile. Everything that involves other members is blocked.

### 4.4 `POST /api/v1/admin/users/:userId/reactivate` (`users:sanction`)

Same body. `suspended` → `active`, audited as `user.reactivate`. `409` if the account isn't suspended.

## 5. Web app

| Route | Page | Notes |
|---|---|---|
| `/onboarding` | 3 steps: **About you** (profile form, 18+ confirmation, terms) → **Photo** → **Preferences** | Resumes at the first unfinished step. Members without a profile are redirected here from every profile route |
| `/` | Home | Completion card and a "Finish your profile" call to action |
| `/profile` | Profile | Completion, status, **preview card** (exactly what others see), private details ("only visible to you") |
| `/profile/edit` | Edit profile | Photo upload/replace/remove + profile form (DOB not editable) |
| `/profile/preferences` | Preferences | Gender, age range, verified-only, discovery and show-area toggles |

Forms validate with the **same shared schemas** as the API, then map any server `VALIDATION_ERROR.details` onto their fields. The photo picker checks type, size and dimensions before uploading. The server re-validates everything.

## 6. Admin app

| Route | Page |
|---|---|
| `/users` | Search (name, mobile number, ID), status filter, table with account and profile status and completion, "Load more" pagination |
| `/users/:userId` | Profile (including private fields), account, preferences, verifications. **Suspend / Reactivate** with a required reason (only shown with `users:sanction`) |

## 7. Tests

| File | Covers |
|---|---|
| `packages/shared/test/profile.test.ts` | Ages (18 today), IST dates, available-date rules, contact detection, completion math, schemas |
| `apps/api/src/lib/image.test.ts` | GPS/EXIF stripping, accepted formats, resize, too-small, GIF, non-images |
| `apps/api/src/modules/profiles/profile.int.test.ts` | Create/get/update, underage lock, validation cases, conflicts, preferences, image upload/replace/delete/limits/storage failure, badge revocation, public-profile allow-list, visibility rules, viewer requirements, preview |
| `apps/api/src/modules/admin/users/admin-users.int.test.ts` | Permissions, list/search/filter/pagination, detail, suspend (sessions revoked, audit), reactivate, append-only audit log |
| `apps/api/src/models/models.int.test.ts` | DB constraints: garba level, area-in-city FK, Instagram format, date limit |

Run with `npm run test` (integration tests need `TEST_DATABASE_URL`).

## 8. Known limitations

- **One photo per profile.** Multiple photos and moderator photo review are planned.
- **No photo moderation queue yet.** Photos are visible immediately (post-moderation by design). Admins can suspend accounts, but can't yet reject a single photo.
- Reference cities and areas are managed by migration until the admin locations screens exist.
- Blocking isn't implemented yet, so the public profile doesn't apply the block check. It's documented as a requirement for the safety phase.
- Seeded development users have no photos, so they're all `incomplete`. Create complete profiles through the web app.
