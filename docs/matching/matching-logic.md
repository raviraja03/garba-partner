# Matching Logic

> Related: [Discovery](discovery.md), [Discovery privacy](privacy.md). Code: `apps/api/src/modules/discovery/{matching,candidate-query}.ts`.

Discovery works in two strictly separate stages:

1. **Eligibility** (hard rules, SQL `WHERE`): decides *who may appear at all*. Safety and consent rules live here, so no amount of ranking can surface an ineligible member.
2. **Ranking** (soft signals, SQL `ORDER BY`): decides *the order* of eligible members. Deterministic and simple on purpose.

## 1. Eligibility (hard rules)

A candidate appears only if **all** of these hold:

| # | Rule | SQL |
|---|---|---|
| 1 | Not the viewer | `u.id <> :viewerId` |
| 2 | Account active, not deleted | `u.status = 'active' AND u.deleted_at IS NULL` (excludes suspended, banned, pending deletion, deleted) |
| 3 | Onboarded, with a photo (complete profile) | `u.onboarding_completed_at IS NOT NULL AND p.image_public_id IS NOT NULL` |
| 4 | Not hidden pending review (P0 report or 3 reporters in 7 days) | `NOT u.hidden_from_discovery` |
| 5 | Opted in to discovery | `pr.discovery_enabled` |
| 6 | **No block in either direction** | `NOT EXISTS (blocks …)` both ways |
| 7 | Not reported by the viewer (any status) | `NOT EXISTS (reports WHERE reporter = viewer AND reported = candidate)` |
| 8 | **Mutual gender preference** | candidate's gender ∈ viewer's preference **and** viewer's gender ∈ candidate's preference |
| 9 | **Mutual age preference** | candidate's age ∈ viewer's range (optionally narrowed by filters) **and** viewer's age ∈ candidate's range |
| 10 | Filters (optional) | city, Garba levels, available date, verified only, event mode |

Gender mapping (`matching.ts`): `women` → `woman`; `men` → `man`; `everyone` → `woman`, `man`, `non_binary`. So a non-binary member is shown only to people whose preference is `everyone`, and sees only people who accept `everyone`.

Age is compared as a date-of-birth range computed in PostgreSQL from today's IST date (`dob <= today − minAge years` and `dob > today − (maxAge + 1) years`). This matches the app's `calculateAge()` (including 29 February birthdays) and can use an index.

**Event mode** adds: the candidate has `looking_for_partner = true` for the event. The service first checks that the event is published and not ended, and that **the viewer** is also looking (reciprocity).

The viewer's own data (gender, age, city, level, dates, preferences) is loaded from the database; nothing about the viewer is taken from the request.

## 2. Ranking (soft signals)

Each eligible candidate gets six boolean signals, weighted as follows (`MATCH_WEIGHTS`):

| Signal | Weight | True when | Highlight shown |
|---|---|---|---|
| Same event | **30** | Both are looking for a partner at the same upcoming, published event | "Going to the same event" |
| Same date | **25** | At least one upcoming available date in common | "Free on the same dates" |
| Same city | **20** | Same home city | "In your city" |
| Age preference | **10** | Ages within 5 years (`LIMITS.SIMILAR_AGE_YEARS`). Both ages already satisfy both ranges (rule 9), so this rewards the closest fits inside them | "Similar age" |
| Garba level | **10** | Same level | "Same Garba level" |
| Other preferences | **5** | Candidate has a verification badge (photo or identity), matching the "verified" preference | "Verified" |

`score = Σ weight × signal` (0–100). Results are ordered by:

1. `score` descending
2. last-active **day** descending (IST calendar day, never the time, so activity times can't be inferred)
3. user `id` ascending (stable tie-break)

This is fully deterministic: the same data and filters always give the same order.

### One source of truth

`matchScore()` (TypeScript) and `scoreSql()` (the SQL expression) are generated from the same `SIGNALS`/`MATCH_WEIGHTS` tables. A unit test asserts the SQL contains exactly those weights.

### Worked example

Viewer: 25, Ahmedabad, intermediate, free on 12 Oct, looking for a partner at "Rangtaali Night".

| Candidate | Signals | Score | Position |
|---|---|---|---|
| A: Vadodara, 34, beginner, also looking at Rangtaali | same event | 30 | 1 |
| B: Vadodara, 34, beginner, free on 12 Oct | same date | 25 | 2 |
| C: Ahmedabad, 34, beginner | same city | 20 | 3 or 4 |
| D: Vadodara, 26, intermediate | similar age + same level | 20 | 3 or 4 (tie → last-active day, then ID) |
| E: Vadodara, 34, beginner, photo verified | verified | 5 | 5 |

## 3. Pagination

Keyset pagination over `(score DESC, active_day DESC, id ASC)`, written as one ascending row comparison `(0 − score, 0 − active_day, id) > (…)`. The cursor is an opaque base64url of those three keys. It is validated strictly (non-negative integers and a UUID) before it reaches SQL, and the values are bound as replacements. Pages never overlap or skip, even with equal scores (integration-tested).

## 4. What members see

- **Never the score.** A number would read as a compatibility rating; it is only an ordering heuristic. The API has no score field and rejects `score`/`sort` parameters. Tests assert the word "score" never appears in responses.
- **Highlights** (`MatchHighlight[]`) in plain words, plus the actual shared dates and shared events (both already mutual information: see [privacy](privacy.md)).
- The web page states: "Suggestions are ordered by simple signals like shared events and dates. They say nothing about whether someone is a good or safe match."

## 5. Why these choices

| Choice | Reason |
|---|---|
| Mutual preferences as hard filters | Consent: nobody is shown to people outside the range they chose, in either direction ([user flows §6.1](../product/user-flows.md#61-eligibility-filter-applied-server-side-to-every-candidate-in-both-modes)) |
| Everything in one SQL query | Eligibility can't be bypassed by paging, and blocks/reports apply instantly |
| Filters only narrow | A filter can't expose members to someone outside their own preferences |
| No ML, no behavioural signals | Deterministic, explainable, and nothing to game or leak |

## 6. Query and indexes

Shape (see `buildCandidateQuery`): `users ⋈ user_profiles ⋈ user_preferences` filtered by the eligibility rules, computing six boolean signal columns, wrapped to add `score`, then the keyset condition, `ORDER BY`, `LIMIT page + 1`. The page is then loaded through the existing allow-list mapper (`toPublicProfileDto`), and shared events come from one extra query for the page's IDs.

| Index | Supports |
|---|---|
| `users_discoverable_idx (id) WHERE status = 'active' AND deleted_at IS NULL AND NOT hidden_from_discovery AND onboarding_completed_at IS NOT NULL` | Account-state rules |
| `user_profiles_discovery_idx (city_id, gender, date_of_birth) WHERE image_public_id IS NOT NULL` | City, gender and age range |
| `user_profiles_available_dates_gin_idx` (GIN) | `available_dates @> [date]` filter, `&&` overlap |
| `user_preferences_discovery_enabled_idx` (existing, partial) | Discovery opt-in |
| `blocks_pair_unique (blocker_id, blocked_id)`, `blocks_blocked_id_idx` (existing) | Block exclusion, both directions |
| `reports_reporter_reported_idx (reporter_id, reported_user_id)` | Reported-by-viewer exclusion |
| `event_attendances_looking_event_idx (event_id, user_id) WHERE looking_for_partner` | Event mode |
| `event_attendances_looking_user_idx (user_id, event_id) WHERE looking_for_partner` | Same-event signal, shared events |

Each index was checked with `EXPLAIN` (sequential scans disabled on the small dev database) to confirm the planner can use it for its predicate.

## 7. Scaling notes

- The score is computed for every eligible candidate of a request, then sorted. With city filters and the indexes above this is small for launch volumes (thousands of members per city).
- If it grows: precompute nothing per pair; first add `LIMIT`-friendly pre-filters (e.g. require `cityId` in city mode), then consider materialising "same event" as a join table or caching the viewer's event set.
- Weights are constants; changing them changes ordering only (no migration). Update this document and the unit test together.
