# Privacy Rules for User Data

> Related: [User profile](user-profile.md), [Security architecture §9](../architecture/security-architecture.md#9-data-privacy-retention-and-deletion), [Product principles](../product/product-overview.md#3-product-principles)

These rules are **mandatory** for every endpoint, DTO, log line and UI that touches member data.

## 1. Who can see what

| Data | The member | Other members | Admins (`users:view`) | Logs |
|---|:-:|:-:|:-:|:-:|
| Phone number | ❌ (never returned by any API) | ❌ | ❌ (reveal = separate audited super-admin action, not yet built) | ❌ |
| Date of birth | ✅ | ❌ (**age only**) | ✅ | ❌ |
| Name, gender, bio, garba level | ✅ | ✅ | ✅ | ❌ |
| City | ✅ | ✅ (name) | ✅ | ❌ |
| Area (neighbourhood) | ✅ | **Only if `showArea` is on** | ✅ | ❌ |
| Exact address / GPS | Never collected | — | — | — |
| Photo location data (EXIF/GPS) | Stripped before storage | — | — | — |
| Instagram ID | ✅ | ❌ (**private**; may be shared with matches later, with consent) | ✅ (moderation) | ❌ |
| Available dates | ✅ (upcoming) | ✅ (upcoming only) | ✅ | ❌ |
| Preferences (who you want, age range, verified-only) | ✅ | ❌ | ✅ | ❌ |
| Account status, sanctions | ✅ (own status) | ❌ (suspended members simply aren't shown) | ✅ | IDs only |
| Last active / online | ❌ | ❌ | ✅ | ❌ |
| Verification details | ✅ (badge) | Badge only | ✅ | ❌ |

## 2. Enforcement

1. **Allow-list DTOs.** `toPublicProfileDto()`, `toOwnProfileDto()` and the admin mappers copy fields explicitly. Nothing is spread from a model, so a new column can never leak by accident. Tests assert the **exact key set** of the public profile.
2. **Model scopes.** `User`'s default scope excludes the phone columns, and `AdminUser`'s excludes the password hash.
3. **Identical 404s.** Unknown, suspended, banned, deleted and incomplete profiles all return the same `404 Profile not found.` A viewer can't learn why a profile is unavailable.
4. **Viewer requirements.** Only active, onboarded members can view other profiles. Public profiles are never available to anonymous visitors or search engines.
5. **Strict input schemas.** Unknown keys are rejected, so no one can smuggle `phone` or `status` into their profile.
6. **Contact details kept out of profiles.** Names can't contain digits. Bios can't contain phone numbers, emails or links. Instagram is a separate, private field.
7. **Location minimisation.** City and neighbourhood only, from an admin-managed list (no free text, no GPS). Area visibility is opt-in (`showArea` defaults to `false`). Photos lose their GPS EXIF.
8. **Discovery is opt-in.** `discoveryEnabled` defaults to `false`, so members choose to be found.
9. **Logging.** Request and response bodies aren't logged. Pino redacts `authorization`, `cookie`, `set-cookie`, `phone`, `otp`, `code`, `password` and `token*`. Admin audit metadata holds reasons and IDs only. The end-to-end check confirmed no phone number, DOB, Instagram handle or password appears in the API log.
10. **Admin searches by phone** compare HMACs. The number searched for isn't stored or logged.
11. **Suspension takes effect immediately:** sessions are revoked, the profile disappears for others, and the member can still see and correct their own data.

## 3. Checklist for new features

- [ ] New member-facing fields are added to an **explicit** DTO mapper, and the privacy table above is updated.
- [ ] Anything showing one member to another goes through `requireActiveMember` and, once blocking exists, the interaction gate.
- [ ] No private field (phone, DOB, Instagram, preferences, exact location, activity timestamps) appears in another member's response. Add a test that asserts the key set.
- [ ] Free-text fields reject contact details, or at least warn.
- [ ] No personal data in logs or audit metadata.
- [ ] Unavailable resources return the same `404` whatever the reason.
