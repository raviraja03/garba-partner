# Discovery Privacy

> Related: [Discovery](discovery.md), [Matching logic](matching-logic.md), [Privacy rules](../users/privacy-rules.md), [Security architecture](../architecture/security-architecture.md)

Discovery shows members to each other, so it is the feature with the most privacy and safety risk. These are the rules it follows and how each one is enforced.

## 1. What another member can see

| Data | Visible in discovery? | Notes |
|---|---|---|
| Name, age, gender, city, Garba level, bio, photo | ✅ | The same public allow-list as profiles (`PublicProfileDto`, `toPublicProfileDto`) |
| Area (neighbourhood) | Only if the member turned on `showArea` | Never street level |
| Upcoming available dates | ✅ | Already part of the public profile |
| Verification badges | ✅ | Describe what was checked (phone by OTP, photo, identity), **never** that someone is safe |
| Shared dates | ✅ | Intersection of two public lists |
| Shared events | Only events **both** are looking for a partner at | Reciprocal (see §3) |
| Highlights | ✅ | Plain reasons, no score |
| Phone number | ❌ never | Not selected by discovery queries |
| Date of birth | ❌ | Age only |
| Instagram handle | ❌ | Private |
| Exact location, GPS, distance | ❌ | Not stored; photos are EXIF/GPS-stripped |
| Preferences (gender/age range, verified only) | ❌ | Used for filtering only |
| Account status, reports, blocks | ❌ | Ineligible members simply don't appear |
| Last active time | ❌ | Only a **day-level** value is used internally for ordering, never returned |
| Ranking score | ❌ | Internal only ([matching logic §4](matching-logic.md#4-what-members-see)) |
| Events a member attends but isn't "looking" at | ❌ | Never revealed to anyone |

Tests assert the exact response key sets and that phone numbers, dates of birth, Instagram handles and the word "score" never appear.

## 2. No exact location

- Location is only a **city** and an optional **neighbourhood from a fixed list**, and the neighbourhood is shown only with `showArea`.
- Discovery never computes or returns distances. "Same city" is the only location signal, shown as "In your city".
- Filtering by city doesn't reveal anything beyond the city already shown on the profile.

## 3. Event attendance is reciprocal

- Attendance is private by default. Event pages show no attendees (integration-tested).
- A member appears in **event mode** only if they turned on "I'm looking for a partner for this event", and the viewer can only open event mode if **they** turned it on too (`409 PARTNER_TOGGLE_REQUIRED` otherwise).
- "Shared events" and the "same event" ranking signal only count events where **both** members are looking. Attendance without the toggle never influences anything another member sees.
- Ended, unpublished or archived events stop counting immediately.

## 4. Consent and blocking

- **Mutual preferences:** a member is only shown to people whose gender and age fit **their** preferences, and vice versa. Filters can narrow but never widen the viewer's own preferences.
- **Opt-in:** only members with discovery turned on appear.
- **Blocks** hide both members from each other everywhere discovery and profiles are served (`/partners`, `/partners/:id`, `/users/:id/profile`). The blocked member is never told: every unavailable profile returns the same `404`.
- **Reports:** the reporter never sees the reported member again (even without blocking). Serious reports (`underage`, `safety_threat`) or three reporters within seven days hide the member from **everyone** until a moderator reviews.
- **Sanctions:** suspended, banned and pending-deletion members neither appear nor can browse.

## 5. Abuse and scraping controls

- Discovery requires an active, onboarded account with a completed profile; there's no anonymous access.
- 60 discovery requests per minute per member; attendance changes 60/hour; blocks 30/hour; reports 10/day.
- Results are `Cache-Control: private, no-store`.
- Profile images use random public IDs that say nothing about the member.

## 6. Verification wording

Badges and the "Verified" highlight describe **what was checked**, never safety. The web shows, for example: "Badges show what was checked, never that someone is safe", plus safety tips on every partner profile (meet at the event or another busy public place, tell a friend, never send money or share OTPs).

## 7. Checklist for changes to discovery

- [ ] New fields go through `toPublicProfileDto` (allow-list) or an equally explicit DTO. Update the key-set tests.
- [ ] Any new signal must be derivable from information both members already share, or be reciprocal.
- [ ] Never return the score, distances, exact times or private preferences.
- [ ] New hard rules go in `buildCandidateQuery`'s `WHERE`, with a test in `discovery.int.test.ts` and a check in the unit test's "always contains every hard eligibility rule".
- [ ] Update this document.
