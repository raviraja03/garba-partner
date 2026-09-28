# Database Schema

> **Source of truth for implemented tables.** Related: [Relationships](relationships.md), [Migration guide](migration-guide.md), [Database setup](database-setup.md), [Database architecture (target design)](../architecture/database-architecture.md)

Implemented so far: `users`, `user_profiles`, `user_preferences`, `user_sessions`, `user_verifications`, `otp_requests`, `admin_users`, `admin_sessions`, `admin_audit_logs`, `cities`, `areas`, plus the migration bookkeeping tables `schema_migrations` and `schema_seeders`. Other tables in the [target design](../architecture/database-architecture.md) are added by later phases.

## 1. ERD

```mermaid
erDiagram
    users ||--o| user_profiles : "has (0..1)"
    users ||--o| user_preferences : "has (0..1)"
    users ||--o{ user_sessions : "has (0..n)"
    users ||--o{ user_verifications : "has (0..n)"
    admin_users ||--o{ admin_sessions : "has (0..n)"
    admin_users |o--o{ user_verifications : "reviews"
    admin_users ||--o{ admin_audit_logs : "writes"
    cities ||--o{ areas : "contains"
    cities ||--o{ user_profiles : "home city"
    areas |o--o{ user_profiles : "area (same city)"

    users {
        uuid id PK
        char64 phone_hash UK "HMAC-SHA256, null only when erased"
        text phone_encrypted "AES-256-GCM, null only when erased"
        smallint phone_key_version
        varchar20 status "active|suspended|banned|pending_deletion"
        timestamptz onboarding_completed_at
        timestamptz underage_rejected_at
        timestamptz photo_verified_at
        boolean hidden_from_discovery
        varchar30 hidden_reason
        varchar20 terms_version
        timestamptz terms_accepted_at
        timestamptz last_active_at
        timestamptz deletion_requested_at
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at "soft delete"
    }

    user_profiles {
        uuid id PK
        uuid user_id FK, UK
        varchar30 display_name
        date date_of_birth "never shown to others"
        varchar20 gender "woman|man|non_binary"
        varchar300 bio
        varchar20 garba_level "beginner|intermediate|advanced"
        uuid city_id FK
        uuid area_id FK "must belong to city_id"
        varchar30 instagram_handle "private"
        date_array available_dates "max 30"
        varchar255 image_public_id UK "Cloudinary"
        int image_width
        int image_height
        timestamptz image_uploaded_at
        timestamptz created_at
        timestamptz updated_at
    }

    user_preferences {
        uuid id PK
        uuid user_id FK, UK
        varchar20 partner_gender_preference "women|men|everyone"
        smallint age_min "18..80"
        smallint age_max "18..80"
        boolean verified_only "default false"
        boolean discovery_enabled "default false"
        boolean show_area "default false"
        timestamptz created_at
        timestamptz updated_at
    }

    cities {
        uuid id PK
        varchar80 name
        varchar80 state
        varchar100 slug UK
        boolean is_active
        smallint sort_order
    }

    areas {
        uuid id PK
        uuid city_id FK
        varchar80 name
        varchar100 slug "unique per city"
        boolean is_active
        smallint sort_order
    }

    admin_audit_logs {
        uuid id PK
        uuid admin_id FK
        varchar60 action "e.g. user.suspend"
        varchar30 target_type
        uuid target_id
        jsonb metadata "reason, from/to"
        char64 ip_hash
        timestamptz created_at "append-only"
    }

    user_sessions {
        uuid id PK
        uuid user_id FK
        char64 refresh_token_hash UK "SHA-256 only"
        char64 previous_refresh_token_hash
        timestamptz rotated_at
        varchar255 user_agent
        char64 ip_hash
        timestamptz last_used_at
        timestamptz expires_at
        timestamptz revoked_at
        varchar30 revoked_reason
        timestamptz created_at
        timestamptz updated_at
    }

    user_verifications {
        uuid id PK
        uuid user_id FK
        varchar20 type "photo|government_id"
        varchar40 provider "internal_review"
        varchar100 provider_reference
        varchar20 status "initiated|pending|approved|rejected|expired|revoked"
        varchar40 challenge_code
        varchar255 evidence_reference "opaque pointer, purged"
        timestamptz evidence_deleted_at
        varchar30 failure_reason
        timestamptz submitted_at
        timestamptz decided_at
        timestamptz expires_at
        uuid reviewed_by_admin_id FK "admin_users, RESTRICT"
        timestamptz created_at
        timestamptz updated_at
    }

    otp_requests {
        uuid id PK
        char64 phone_hash "HMAC, no FK (number may be new)"
        char64 otp_hash "HMAC of the code"
        smallint attempts
        timestamptz expires_at
        timestamptz consumed_at
        timestamptz invalidated_at
        char64 ip_hash
        timestamptz created_at
        timestamptz updated_at
    }

    admin_users {
        uuid id PK
        varchar254 email UK "lowercase"
        varchar100 name
        varchar20 role "super_admin|moderator|event_manager"
        text password_hash "Argon2id"
        varchar20 status "active|disabled"
        smallint failed_login_count
        timestamptz locked_until
        timestamptz last_login_at
        timestamptz created_at
        timestamptz updated_at
    }

    admin_sessions {
        uuid id PK
        uuid admin_id FK
        char64 refresh_token_hash UK
        char64 previous_refresh_token_hash
        timestamptz rotated_at
        varchar255 user_agent
        char64 ip_hash
        timestamptz last_used_at "idle timeout"
        timestamptz expires_at
        timestamptz revoked_at
        varchar30 revoked_reason
        timestamptz created_at
        timestamptz updated_at
    }
```

## 2. Conventions

| Convention | Rule |
|---|---|
| Primary keys | `uuid` with `DEFAULT gen_random_uuid()`. Models also generate UUIDv4 |
| Naming | `snake_case` tables and columns, plural tables. Models use camelCase attributes (`underscored: true`) |
| Timestamps | `created_at`/`updated_at` `timestamptz NOT NULL DEFAULT now()` on every table. `updated_at` is also maintained by the `set_updated_at()` trigger, so raw SQL updates stay correct |
| Enumerations | `varchar` + `CHECK` constraint (not PG enums). Values mirror `packages/shared/src/constants/enums.ts` |
| Constraint names | `<table>_<column(s)>_<check\|unique\|idx>`, so errors are easy to trace |
| Foreign keys | Always declared. `ON DELETE CASCADE` from user-owned rows to `users` |
| Time zone | All timestamps are UTC (`timestamptz`, Sequelize `timezone: '+00:00'`). Only `date_of_birth` is a `date` |

## 3. Soft-delete strategy

| Table | Strategy | Why |
|---|---|---|
| `users` | **Soft delete** (`deleted_at`, Sequelize `paranoid`) | The row must survive erasure so that reports and sanctions (later phases) keep a valid FK. The CHECK `users_phone_lifecycle_check` requires phone data to be **nulled in the same update** that sets `deleted_at`, so a soft-deleted account holds no personal data |
| `user_profiles` | Hard delete during erasure | Pure personal data. Nothing else needs it after erasure |
| `user_preferences` | Hard delete during erasure | Personal settings |
| `user_sessions` | Logical revocation (`revoked_at` + reason). Expired/revoked rows are purged by a job | Security records with a short life |
| `user_verifications` | Kept as an audit trail (status history). Evidence is purged (`evidence_reference` → null, `evidence_deleted_at` set). Rows are removed with the account | Moderation accountability without keeping evidence |

Account deletion (later phase) runs in **one transaction**: set `status = 'pending_deletion'` and revoke sessions. After the grace period: delete the profile and preferences, purge the evidence, then null the phone columns and set `deleted_at` in a single `UPDATE`. A plain `user.destroy()` is rejected by the database on purpose.

## 4. Tables

### 4.1 `users`

Account record. Personal details live in `user_profiles`, and settings in `user_preferences`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `phone_hash` | char(64) | yes* | | HMAC-SHA256(`PHONE_HASH_SECRET`, E.164), lowercase hex |
| `phone_encrypted` | text | yes* | | AES-256-GCM `base64(iv‖tag‖ciphertext)` with `PHONE_ENCRYPTION_KEY` |
| `phone_key_version` | smallint | yes* | | Key version used for `phone_encrypted` (≥ 1) |
| `status` | varchar(20) | no | `'active'` | `active`, `suspended`, `banned`, `pending_deletion` |
| `onboarding_completed_at` | timestamptz | yes | | |
| `underage_rejected_at` | timestamptz | yes | | Locks DOB submission |
| `photo_verified_at` | timestamptz | yes | | Cached projection of an approved photo verification |
| `hidden_from_discovery` | boolean | no | `false` | Auto-hide after reports |
| `hidden_reason` | varchar(30) | yes | | `p0_report`, `report_threshold`, `no_visible_photo` |
| `terms_version` / `terms_accepted_at` | varchar(20) / timestamptz | yes | | Both set or both null |
| `last_active_at` | timestamptz | yes | | Never exposed precisely to other members |
| `deletion_requested_at` | timestamptz | yes | | Start of the 30-day grace period |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | | Soft delete |

\* Null **only** when the account is erased (see constraint below).

Constraints:

| Name | Rule |
|---|---|
| `users_status_check` | status in the allowed set |
| `users_phone_hash_format_check` | `phone_hash ~ '^[0-9a-f]{64}$'` |
| `users_phone_key_version_check` | `phone_key_version >= 1` |
| `users_phone_lifecycle_check` | live row ⇒ all three phone columns set. Soft-deleted row ⇒ all three null |
| `users_hidden_reason_check` | reason in the allowed set |
| `users_hidden_consistency_check` | `hidden_from_discovery = (hidden_reason IS NOT NULL)` |
| `users_terms_consistency_check` | `terms_version` and `terms_accepted_at` set together |
| `users_pending_deletion_check` | `pending_deletion` ⇒ `deletion_requested_at` set |

Indexes: `users_phone_hash_unique` (UNIQUE, `WHERE phone_hash IS NOT NULL`), `users_status_idx` (`status`, `WHERE deleted_at IS NULL`), `users_deletion_requested_at_idx` (`WHERE status = 'pending_deletion'`).

Model: `User`. The **default scope excludes** `phoneHash`, `phoneEncrypted` and `phoneKeyVersion`. Load them only with `User.scope('withPhone')` (auth and audited phone-reveal code only).

### 4.2 `user_profiles`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | | FK → `users.id` `ON DELETE CASCADE`. **Unique** |
| `display_name` | varchar(30) | no | | 2–30 characters after trimming |
| `date_of_birth` | date | no | | ≥ 1900-01-01. Immutable through the API. The 18+ rule is enforced in the service (it depends on "today") |
| `gender` | varchar(20) | no | | `woman`, `man`, `non_binary` |
| `bio` | varchar(300) | yes | | No contact details (API rule) |
| `garba_level` | varchar(20) | no | | `beginner`, `intermediate`, `advanced` |
| `city_id` | uuid | no | | FK → `cities.id` `ON DELETE RESTRICT` |
| `area_id` | uuid | yes | | Composite FK `(area_id, city_id)` → `areas (id, city_id)`: the area must belong to the city. Shown to others only with `show_area` |
| `instagram_handle` | varchar(30) | yes | | **Private**. Lowercase, `^[a-z0-9._]{1,30}# Database Schema

> **Source of truth for implemented tables.** Related: [Relationships](relationships.md), [Migration guide](migration-guide.md), [Database setup](database-setup.md), [Database architecture (target design)](../architecture/database-architecture.md)

Implemented so far: `users`, `user_profiles`, `user_preferences`, `user_sessions`, `user_verifications`, `otp_requests`, `admin_users`, `admin_sessions`, `admin_audit_logs`, `cities`, `areas`, plus the migration bookkeeping tables `schema_migrations` and `schema_seeders`. Other tables in the [target design](../architecture/database-architecture.md) are added by later phases.

## 1. ERD

```mermaid
erDiagram
    users ||--o| user_profiles : "has (0..1)"
    users ||--o| user_preferences : "has (0..1)"
    users ||--o{ user_sessions : "has (0..n)"
    users ||--o{ user_verifications : "has (0..n)"
    admin_users ||--o{ admin_sessions : "has (0..n)"
    admin_users |o--o{ user_verifications : "reviews"
    admin_users ||--o{ admin_audit_logs : "writes"
    cities ||--o{ areas : "contains"
    cities ||--o{ user_profiles : "home city"
    areas |o--o{ user_profiles : "area (same city)"

    users {
        uuid id PK
        char64 phone_hash UK "HMAC-SHA256, null only when erased"
        text phone_encrypted "AES-256-GCM, null only when erased"
        smallint phone_key_version
        varchar20 status "active|suspended|banned|pending_deletion"
        timestamptz onboarding_completed_at
        timestamptz underage_rejected_at
        timestamptz photo_verified_at
        boolean hidden_from_discovery
        varchar30 hidden_reason
        varchar20 terms_version
        timestamptz terms_accepted_at
        timestamptz last_active_at
        timestamptz deletion_requested_at
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at "soft delete"
    }

    user_profiles {
        uuid id PK
        uuid user_id FK, UK
        varchar30 display_name
        date date_of_birth "never shown to others"
        varchar20 gender "woman|man|non_binary"
        varchar300 bio
        varchar20 garba_level "beginner|intermediate|advanced"
        uuid city_id FK
        uuid area_id FK "must belong to city_id"
        varchar30 instagram_handle "private"
        date_array available_dates "max 30"
        varchar255 image_public_id UK "Cloudinary"
        int image_width
        int image_height
        timestamptz image_uploaded_at
        timestamptz created_at
        timestamptz updated_at
    }

    user_preferences {
        uuid id PK
        uuid user_id FK, UK
        varchar20 partner_gender_preference "women|men|everyone"
        smallint age_min "18..80"
        smallint age_max "18..80"
        boolean verified_only "default false"
        boolean discovery_enabled "default false"
        boolean show_area "default false"
        timestamptz created_at
        timestamptz updated_at
    }

    cities {
        uuid id PK
        varchar80 name
        varchar80 state
        varchar100 slug UK
        boolean is_active
        smallint sort_order
    }

    areas {
        uuid id PK
        uuid city_id FK
        varchar80 name
        varchar100 slug "unique per city"
        boolean is_active
        smallint sort_order
    }

    admin_audit_logs {
        uuid id PK
        uuid admin_id FK
        varchar60 action "e.g. user.suspend"
        varchar30 target_type
        uuid target_id
        jsonb metadata "reason, from/to"
        char64 ip_hash
        timestamptz created_at "append-only"
    }

    user_sessions {
        uuid id PK
        uuid user_id FK
        char64 refresh_token_hash UK "SHA-256 only"
        char64 previous_refresh_token_hash
        timestamptz rotated_at
        varchar255 user_agent
        char64 ip_hash
        timestamptz last_used_at
        timestamptz expires_at
        timestamptz revoked_at
        varchar30 revoked_reason
        timestamptz created_at
        timestamptz updated_at
    }

    user_verifications {
        uuid id PK
        uuid user_id FK
        varchar20 type "photo|government_id"
        varchar40 provider "internal_review"
        varchar100 provider_reference
        varchar20 status "initiated|pending|approved|rejected|expired|revoked"
        varchar40 challenge_code
        varchar255 evidence_reference "opaque pointer, purged"
        timestamptz evidence_deleted_at
        varchar30 failure_reason
        timestamptz submitted_at
        timestamptz decided_at
        timestamptz expires_at
        uuid reviewed_by_admin_id FK "admin_users, RESTRICT"
        timestamptz created_at
        timestamptz updated_at
    }

    otp_requests {
        uuid id PK
        char64 phone_hash "HMAC, no FK (number may be new)"
        char64 otp_hash "HMAC of the code"
        smallint attempts
        timestamptz expires_at
        timestamptz consumed_at
        timestamptz invalidated_at
        char64 ip_hash
        timestamptz created_at
        timestamptz updated_at
    }

    admin_users {
        uuid id PK
        varchar254 email UK "lowercase"
        varchar100 name
        varchar20 role "super_admin|moderator|event_manager"
        text password_hash "Argon2id"
        varchar20 status "active|disabled"
        smallint failed_login_count
        timestamptz locked_until
        timestamptz last_login_at
        timestamptz created_at
        timestamptz updated_at
    }

    admin_sessions {
        uuid id PK
        uuid admin_id FK
        char64 refresh_token_hash UK
        char64 previous_refresh_token_hash
        timestamptz rotated_at
        varchar255 user_agent
        char64 ip_hash
        timestamptz last_used_at "idle timeout"
        timestamptz expires_at
        timestamptz revoked_at
        varchar30 revoked_reason
        timestamptz created_at
        timestamptz updated_at
    }
```

## 2. Conventions

| Convention | Rule |
|---|---|
| Primary keys | `uuid` with `DEFAULT gen_random_uuid()`. Models also generate UUIDv4 |
| Naming | `snake_case` tables and columns, plural tables. Models use camelCase attributes (`underscored: true`) |
| Timestamps | `created_at`/`updated_at` `timestamptz NOT NULL DEFAULT now()` on every table. `updated_at` is also maintained by the `set_updated_at()` trigger, so raw SQL updates stay correct |
| Enumerations | `varchar` + `CHECK` constraint (not PG enums). Values mirror `packages/shared/src/constants/enums.ts` |
| Constraint names | `<table>_<column(s)>_<check\|unique\|idx>`, so errors are easy to trace |
| Foreign keys | Always declared. `ON DELETE CASCADE` from user-owned rows to `users` |
| Time zone | All timestamps are UTC (`timestamptz`, Sequelize `timezone: '+00:00'`). Only `date_of_birth` is a `date` |

## 3. Soft-delete strategy

| Table | Strategy | Why |
|---|---|---|
| `users` | **Soft delete** (`deleted_at`, Sequelize `paranoid`) | The row must survive erasure so that reports and sanctions (later phases) keep a valid FK. The CHECK `users_phone_lifecycle_check` requires phone data to be **nulled in the same update** that sets `deleted_at`, so a soft-deleted account holds no personal data |
| `user_profiles` | Hard delete during erasure | Pure personal data. Nothing else needs it after erasure |
| `user_preferences` | Hard delete during erasure | Personal settings |
| `user_sessions` | Logical revocation (`revoked_at` + reason). Expired/revoked rows are purged by a job | Security records with a short life |
| `user_verifications` | Kept as an audit trail (status history). Evidence is purged (`evidence_reference` → null, `evidence_deleted_at` set). Rows are removed with the account | Moderation accountability without keeping evidence |

Account deletion (later phase) runs in **one transaction**: set `status = 'pending_deletion'` and revoke sessions. After the grace period: delete the profile and preferences, purge the evidence, then null the phone columns and set `deleted_at` in a single `UPDATE`. A plain `user.destroy()` is rejected by the database on purpose.

## 4. Tables

### 4.1 `users`

Account record. Personal details live in `user_profiles`, and settings in `user_preferences`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `phone_hash` | char(64) | yes* | | HMAC-SHA256(`PHONE_HASH_SECRET`, E.164), lowercase hex |
| `phone_encrypted` | text | yes* | | AES-256-GCM `base64(iv‖tag‖ciphertext)` with `PHONE_ENCRYPTION_KEY` |
| `phone_key_version` | smallint | yes* | | Key version used for `phone_encrypted` (≥ 1) |
| `status` | varchar(20) | no | `'active'` | `active`, `suspended`, `banned`, `pending_deletion` |
| `onboarding_completed_at` | timestamptz | yes | | |
| `underage_rejected_at` | timestamptz | yes | | Locks DOB submission |
| `photo_verified_at` | timestamptz | yes | | Cached projection of an approved photo verification |
| `hidden_from_discovery` | boolean | no | `false` | Auto-hide after reports |
| `hidden_reason` | varchar(30) | yes | | `p0_report`, `report_threshold`, `no_visible_photo` |
| `terms_version` / `terms_accepted_at` | varchar(20) / timestamptz | yes | | Both set or both null |
| `last_active_at` | timestamptz | yes | | Never exposed precisely to other members |
| `deletion_requested_at` | timestamptz | yes | | Start of the 30-day grace period |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |
| `deleted_at` | timestamptz | yes | | Soft delete |

\* Null **only** when the account is erased (see constraint below).

Constraints:

| Name | Rule |
|---|---|
| `users_status_check` | status in the allowed set |
| `users_phone_hash_format_check` | `phone_hash ~ '^[0-9a-f]{64}$'` |
| `users_phone_key_version_check` | `phone_key_version >= 1` |
| `users_phone_lifecycle_check` | live row ⇒ all three phone columns set. Soft-deleted row ⇒ all three null |
| `users_hidden_reason_check` | reason in the allowed set |
| `users_hidden_consistency_check` | `hidden_from_discovery = (hidden_reason IS NOT NULL)` |
| `users_terms_consistency_check` | `terms_version` and `terms_accepted_at` set together |
| `users_pending_deletion_check` | `pending_deletion` ⇒ `deletion_requested_at` set |

Indexes: `users_phone_hash_unique` (UNIQUE, `WHERE phone_hash IS NOT NULL`), `users_status_idx` (`status`, `WHERE deleted_at IS NULL`), `users_deletion_requested_at_idx` (`WHERE status = 'pending_deletion'`).

Model: `User`. The **default scope excludes** `phoneHash`, `phoneEncrypted` and `phoneKeyVersion`. Load them only with `User.scope('withPhone')` (auth and audited phone-reveal code only).

### 4.2 `user_profiles`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | | FK → `users.id` `ON DELETE CASCADE`. **Unique** |
| `display_name` | varchar(30) | no | | 2–30 characters after trimming |
| `date_of_birth` | date | no | | ≥ 1900-01-01. Immutable through the API. The 18+ rule is enforced in the service (it depends on "today") |
| `gender` | varchar(20) | no | | `woman`, `man`, `non_binary` |
 |
| `available_dates` | date[] | no | `'{}'` | ≤ 30 dates. Sorted by the API. Past dates hidden on read |
| `image_public_id` | varchar(255) | yes | | Cloudinary public ID (random) of the processed, EXIF-free image. **Unique** where not null |
| `image_width` / `image_height` | integer | yes | | Set together with the public ID |
| `image_uploaded_at` | timestamptz | yes | | |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

Constraints: `user_profiles_user_id_unique`, `user_profiles_display_name_check`, `user_profiles_date_of_birth_check`, `user_profiles_gender_check`, `user_profiles_garba_level_check`, `user_profiles_area_in_city_fkey`, `user_profiles_instagram_handle_check`, `user_profiles_available_dates_check`, `user_profiles_image_consistency_check`.
Indexes: `user_profiles_city_id_idx`, `user_profiles_area_id_idx` (partial), `user_profiles_image_public_id_unique` (partial).

Migration `20260928100100-extend-user-profiles` renamed `experience` → `garba_level`, dropped the unused `styles` column and backfilled pre-existing development rows with the first launch city.

### 4.3 `user_preferences`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | | FK → `users.id` `ON DELETE CASCADE`. **Unique** |
| `partner_gender_preference` | varchar(20) | no | `'everyone'` | `women`, `men`, `everyone` |
| `age_min` / `age_max` | smallint | no | 18 / 80 | `18 ≤ age_min ≤ age_max ≤ 80` |
| `verified_only` | boolean | no | `false` | Only suggest photo-verified members (applied by matching, later phase) |
| `discovery_enabled` | boolean | no | **`false`** | Explicit opt-in to discovery |
| `show_area` | boolean | no | **`false`** | Explicit opt-in to showing the area |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

Constraints: `user_preferences_user_id_unique`, `user_preferences_partner_gender_preference_check`, `user_preferences_age_range_check`.
Indexes: `user_preferences_discovery_enabled_idx` (`user_id WHERE discovery_enabled`).

### 4.4 `user_sessions`

One row per login (device). **Only SHA-256 hashes of refresh tokens are stored.** Token issuance and rotation arrive in the auth phase.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK (becomes the JWT `sid`) |
| `user_id` | uuid | no | | FK → `users.id` `ON DELETE CASCADE` |
| `refresh_token_hash` | char(64) | no | | **Unique**, hex |
| `previous_refresh_token_hash` | char(64) | yes | | Reuse detection |
| `rotated_at` | timestamptz | yes | | Set together with the previous hash |
| `user_agent` | varchar(255) | yes | | Truncated |
| `ip_hash` | char(64) | yes | | HMAC of the IP. Raw IPs are not stored |
| `last_used_at` | timestamptz | no | `now()` | |
| `expires_at` | timestamptz | no | | Absolute expiry (> `created_at`) |
| `revoked_at` | timestamptz | yes | | |
| `revoked_reason` | varchar(30) | yes | | `logout`, `logout_all`, `reuse_detected`, `sanction`, `deletion`. Set exactly when revoked |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

Constraints: `user_sessions_refresh_token_hash_unique`, `user_sessions_hash_format_check`, `user_sessions_rotation_consistency_check`, `user_sessions_expiry_check`, `user_sessions_revoked_reason_check`, `user_sessions_revocation_consistency_check`.
Indexes: `user_sessions_active_user_id_idx` (`user_id WHERE revoked_at IS NULL`), `user_sessions_previous_refresh_token_hash_idx` (partial), `user_sessions_expires_at_idx`.

### 4.5 `user_verifications`

**Stores only provider / reference / status metadata.** No document numbers (Aadhaar or other), no document images, no KYC payloads, no free-text notes.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | uuid | no | | FK → `users.id` `ON DELETE CASCADE` |
| `type` | varchar(20) | no | | `photo` (MVP), `government_id` (reserved) |
| `provider` | varchar(40) | no | | `internal_review` (moderator review). New providers need legal review + a migration |
| `provider_reference` | varchar(100) | yes | | External provider's reference ID. Unique per provider |
| `status` | varchar(20) | no | `'initiated'` | `initiated`, `pending`, `approved`, `rejected`, `expired`, `revoked` |
| `challenge_code` | varchar(40) | yes | | e.g. gesture code. `^[a-z0-9_]{1,40}$` |
| `evidence_reference` | varchar(255) | yes | | Opaque pointer to **privately** stored evidence (e.g. a private selfie asset). Nulled when purged |
| `evidence_deleted_at` | timestamptz | yes | | When evidence was purged |
| `failure_reason` | varchar(30) | yes | | Set exactly when `rejected`: `gesture_mismatch`, `face_not_visible`, `does_not_match_photos`, `inappropriate`, `provider_failed`, `other` |
| `submitted_at` / `decided_at` / `expires_at` | timestamptz | yes | | `decided_at` is required for approved/rejected |
| `reviewed_by_admin_id` | uuid | yes | | FK → `admin_users.id` `ON DELETE RESTRICT` (admins are disabled, never deleted) |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

Constraints:

| Name | Rule |
|---|---|
| `user_verifications_type_check` / `_provider_check` / `_status_check` / `_failure_reason_check` | Allowed values |
| `user_verifications_type_provider_check` | `photo` ⇔ `internal_review`. `government_id` needs an external provider (none approved, so it can't be inserted yet) |
| `user_verifications_challenge_code_check` | Code format |
| `user_verifications_rejection_consistency_check` | `failure_reason` set ⇔ `status = 'rejected'` |
| `user_verifications_decision_check` | approved/rejected ⇒ `decided_at` set |
| `user_verifications_evidence_purge_check` | purged ⇒ `evidence_reference` is null |
| `user_verifications_no_identity_numbers_check` | `provider_reference` and `evidence_reference` must not contain an Aadhaar-like number (see below) |

Indexes: `user_verifications_one_open_per_type_unique` (UNIQUE `(user_id, type) WHERE status IN ('initiated','pending')`), `user_verifications_provider_reference_unique` (UNIQUE `(provider, provider_reference)` where not null), `user_verifications_review_queue_idx` (`submitted_at WHERE status = 'pending'`), `user_verifications_user_id_created_at_idx`, `user_verifications_evidence_purge_idx` (`decided_at WHERE evidence_reference IS NOT NULL`).

**Aadhaar guard (defence in depth).** SQL functions `is_verhoeff_valid(text)` and `contains_aadhaar_like_number(text)` (IMMUTABLE) detect a *standalone* 12-digit number, optionally grouped 4-4-4, whose first digit is 2–9 and that passes the Verhoeff checksum. The same rule is implemented in `apps/api/src/lib/pii-guards.ts` and applied by model validation. Requiring the checksum and standalone boundaries keeps false positives on ordinary IDs (e.g. UUIDs) negligible. The primary protection is still the schema itself: there is no column that could hold a document number, image or KYC payload.

### 4.6 `otp_requests`

One-time login codes ([OTP flow](../auth/otp-flow.md)). **Only HMACs are stored.** Neither the code nor the phone number is persisted.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `phone_hash` | char(64) | no | | Same HMAC as `users.phone_hash`. No FK: the number may not have an account yet |
| `otp_hash` | char(64) | no | | HMAC-SHA256(`OTP_HMAC_SECRET`, `otp:<phone_hash>:<code>`) |
| `attempts` | smallint | no | 0 | Wrong attempts (0–20; the app invalidates the code at 5) |
| `expires_at` | timestamptz | no | | created + 5 min |
| `consumed_at` | timestamptz | yes | | Set on successful verification |
| `invalidated_at` | timestamptz | yes | | Superseded, expired or too many attempts |
| `ip_hash` | char(64) | no | | HMAC of the client IP (per-IP limits) |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

Constraints: `otp_requests_hash_format_check`, `otp_requests_attempts_check`, `otp_requests_expiry_check`, `otp_requests_single_outcome_check` (never both consumed and invalidated).
Indexes: `otp_requests_one_active_per_phone_unique` (UNIQUE `(phone_hash) WHERE consumed_at IS NULL AND invalidated_at IS NULL`), `otp_requests_phone_hash_created_at_idx`, `otp_requests_ip_hash_created_at_idx` (rate-limit windows), `otp_requests_created_at_idx` (24 h purge).

### 4.7 `admin_users`

Admin identities, completely separate from members. **Disabled, never deleted** (so audit/verification references stay valid).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `email` | varchar(254) | no | | **Unique**, must be lowercase |
| `name` | varchar(100) | no | | |
| `role` | varchar(20) | no | | `super_admin`, `moderator`, `event_manager` |
| `password_hash` | text | no | | Argon2id PHC string (`$argon2id$…`). Excluded from the default model scope |
| `status` | varchar(20) | no | `'active'` | `active`, `disabled` |
| `failed_login_count` | smallint | no | 0 | Reset on success or lockout |
| `locked_until` | timestamptz | yes | | 15-minute lockout after 5 failures |
| `last_login_at` | timestamptz | yes | | |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

Constraints: `admin_users_email_unique`, `admin_users_email_lowercase_check`, `admin_users_name_check`, `admin_users_role_check`, `admin_users_status_check`, `admin_users_password_hash_check` (Argon2id only), `admin_users_failed_login_count_check`.

TOTP columns (`totp_secret_encrypted`, `totp_enabled_at`, `must_change_password`) will be added by the admin 2FA migration.

### 4.8 `admin_sessions`

Same shape and rules as [`user_sessions`](#44-user_sessions), with `admin_id` (FK → `admin_users.id` `ON DELETE CASCADE`) instead of `user_id`. `last_used_at` drives the 30-minute idle timeout. `revoked_reason` ∈ `logout`, `reuse_detected`, `idle_timeout`, `disabled`.

Constraints and indexes mirror `user_sessions` (`admin_sessions_refresh_token_hash_unique`, `admin_sessions_active_admin_id_idx`, …).

### 4.9 `cities` and `areas`

Reference data, seeded by migration `20260928100000-create-cities-and-areas` with **fixed IDs** (`c1000000-0000-4000-8000-00000000000N` for cities, `a2000000-000C-4000-8000-0000000000NN` for areas). Deactivated (`is_active = false`), never deleted.

| Table | Columns | Constraints |
|---|---|---|
| `cities` | `id`, `name`, `state`, `slug`, `is_active`, `sort_order`, timestamps | `cities_slug_unique`, `cities_name_state_unique`, slug format |
| `areas` | `id`, `city_id` (FK RESTRICT), `name`, `slug`, `is_active`, `sort_order`, timestamps | `areas_city_id_slug_unique`, `areas_id_city_id_unique` (target of the profile composite FK), slug format |

Areas are **neighbourhoods only**, never street-level.

### 4.10 `admin_audit_logs` (append-only)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `admin_id` | uuid | FK → `admin_users.id` `ON DELETE RESTRICT` |
| `action` | varchar(60) | Dotted, e.g. `user.suspend`, `user.reactivate` |
| `target_type` / `target_id` | varchar(30) / uuid | e.g. `user` + user ID |
| `metadata` | jsonb | Reason and before/after. **Never** phone numbers, OTPs, passwords or tokens |
| `ip_hash` | char(64) | HMAC of the admin's IP |
| `created_at` | timestamptz | No `updated_at`: rows never change |

The trigger `admin_audit_logs_append_only` rejects every `UPDATE` and `DELETE`. Indexes: `created_at DESC`, `(admin_id, created_at DESC)`, `(target_type, target_id)`.

### 4.11 Bookkeeping tables

| Table | Created by | Content |
|---|---|---|
| `schema_migrations` | Umzug `SequelizeStorage` | Names of applied migrations |
| `schema_seeders` | Umzug `SequelizeStorage` | Names of applied seeders (development) |

## 5. Database functions and triggers

| Object | Created in | Purpose |
|---|---|---|
| `set_updated_at()` | `20260925100000-create-users` | Trigger function setting `updated_at = now()` |
| `<table>_set_updated_at` triggers | each table's migration | `BEFORE UPDATE` on every table |
| `is_verhoeff_valid(text)` | `20260925100400-create-user-verifications` | Verhoeff checksum |
| `contains_aadhaar_like_number(text)` | same | Used by `user_verifications_no_identity_numbers_check` |
| `reject_audit_log_changes()` + trigger | `20260928100300-create-admin-audit-logs` | Makes `admin_audit_logs` append-only |

## 6. Privacy summary

| Data | Where | Protection |
|---|---|---|
| Phone number | `users` | Only an HMAC hash (lookup) and AES-GCM ciphertext. Excluded from the default model scope. Erased on soft delete |
| Date of birth | `user_profiles` | Never returned to other members (only age) |
| Instagram handle | `user_profiles` | Private: never returned to other members |
| Location | `user_profiles` | City + optional neighbourhood from a fixed list. No address or GPS. Photo EXIF/GPS stripped before storage |
| Refresh tokens | `user_sessions` | SHA-256 hashes only |
| IP addresses | `user_sessions`, `admin_sessions`, `otp_requests` | HMAC only |
| OTP codes | `otp_requests` | HMAC only; never logged |
| Admin passwords | `admin_users` | Argon2id only; excluded from the default scope |
| Identity documents | — | **Not stored anywhere.** Verification rows hold metadata only, and the DB rejects Aadhaar-like values |
| Verification evidence | Private storage (later phase) | Referenced by an opaque pointer and purged after the retention period |
