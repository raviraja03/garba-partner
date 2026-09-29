# Organizer Management

> Related: [Event management](event-management.md), [Event API](event-api.md#admin-organizers), [Privacy rules](../users/privacy-rules.md), [Schema](../database/schema.md#411-event_organizers)

## 1. Purpose

Every event belongs to an **organizer** (`event_organizers`). Organizers are created and maintained by admins; there is no organizer self-service in the MVP. An organizer record has a **public profile** shown on event pages and **private contact details** that only admins who manage events can see.

## 2. Fields and visibility

| Field | API name | Visibility | Rules |
|---|---|---|---|
| Name | `name` | Public | 2–150 chars, unique (case-insensitive) |
| About | `description` | Public | ≤1000 chars, **no phone numbers or emails** |
| Website | `websiteUrl` | Public | `https://` only |
| Instagram | `instagramHandle` | Public | Business handle, stored without `@` |
| Verified | `isVerified`, `verifiedAt` | Public (badge) | Only via verify/unverify |
| Contact person | `contact.contactName` | **Private** | ≤100 chars |
| Contact email | `contact.contactEmail` | **Private** | Valid email, stored lowercase |
| Contact phone | `contact.contactPhone` | **Private** | 7–15 digits, `+ ( ) -` and spaces allowed |
| Internal notes | `contact.notes` | **Private** | ≤2000 chars (e.g. how the organizer was verified) |
| Status | `status`, `archivedAt` | Admin | `active` \| `archived` |

### Who sees what

| Viewer | Public fields | Private contact |
|---|---|---|
| Visitors and members (public event API) | ✅ `id`, `name`, `isVerified` on cards; + `description`, `websiteUrl`, `instagramHandle` on detail | ❌ never |
| Admins with `events:view` only (moderators) | ✅ | ❌ `contact: null` |
| Admins with `events:manage` (event managers, super admins) | ✅ | ✅ |

## 3. How private information is protected

1. **Separate columns, allow-list DTOs.** Public DTOs (`PublicOrganizerSummaryDto`, `PublicOrganizerDto`) have no contact fields at all. The mappers copy named fields only.
2. **Never loaded on public paths.** Public event queries select only `ORGANIZER_PUBLIC_ATTRIBUTES` (`id, name, description, websiteUrl, instagramHandle, isVerified`), so contact columns are not even read from the database.
3. **Permission-scoped admin detail.** `GET /admin/organizers/:id` returns `contact: null` unless the admin's role has `events:manage`.
4. **Public text guard.** Event and organizer descriptions reject phone numbers and email addresses, so a contact number can't be pasted into public text by mistake.
5. **No logging of contact values.** Audit entries store the organizer name on create and **field names** on update, never contact values. Admin responses are `Cache-Control: no-store`.
6. **Tests** assert the exact public key sets and that contact values never appear in public or moderator responses.

## 4. Verification

- `POST /admin/organizers/:id/verify` marks the organizer as verified (`events:manage`). The admin UI asks for confirmation and the action is audited. Record how you checked (e.g. a call to the published business number, matching social accounts) in **Internal notes**.
- Changing the **public identity** (name, website or Instagram) clears verification automatically. Contact-only edits keep it.
- Archived organizers cannot be verified.
- The web badge reads "Verified organizer" with the explanation: "*Our team has checked that this organizer is genuine. Verification is not a guarantee of safety, quality or ticket validity.*"

## 5. Admin screens

| Route | Permission | Contents |
|---|---|---|
| `/organizers` | `events:view` | Search by name, filter by status/verified, sorted by name, load more |
| `/organizers/new` | `events:manage` | Form with "Public profile" and "Private contact (admins only)" sections |
| `/organizers/:id` | `events:view` | Public profile, event counts, private contact (or a note if hidden), actions |
| `/organizers/:id/edit` | `events:manage` | Same form |

The event form's organizer picker uses `GET /admin/organizers/options` (active organizers only, max 500, verified ones marked ✓).

## 6. Lifecycle

- Organizers are **archived, never deleted** (events reference them with `ON DELETE RESTRICT`).
- **Archive** is refused (`409`) while the organizer has upcoming published events. Unpublish or archive those first.
- Archived organizers can't be edited, verified or chosen for events. **Restore** makes them active again.

## 7. Database

`event_organizers` ([schema](../database/schema.md#411-event_organizers)): UUID PK, unique index on `lower(name)`, checks for status/archived and verified consistency, `https://` website, Instagram format; `created_by_admin_id` / `updated_by_admin_id` FKs to `admin_users`. Private columns carry `COMMENT`s marking them private. Audit entries use `target_type = 'organizer'`.

## 8. Testing

`apps/api/src/modules/admin/organizers/admin-organizers.int.test.ts` covers: anonymous/member rejection; moderators can view but not create/edit/verify/archive; contact hidden from moderators; audit without contact values; strict schema (no `isVerified`/`status`); link/email/phone/public-text validation; case-insensitive duplicate names (`409`); verification reset on identity change only; verify/unverify transitions; archive blocked by upcoming published events; archived organizers unusable for events; search, filters, cursor pagination and the options endpoint.

## 9. Known limitations

- No organizer self-service portal (post-MVP, see [MVP scope](../product/MVP-scope.md)).
- Contact details are stored in plain text (admin-only, business contacts). Revisit field-level encryption before storing personal numbers at scale.
- No merge tool for duplicate organizers; the unique name index prevents most duplicates.
