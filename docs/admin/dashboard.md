# Admin Dashboard

> Related: [Authorization](../auth/authorization.md), [Payments](../payments/payment-flow.md), [Moderation system](../safety/moderation-system.md), [Notifications monitoring](../notifications/notifications.md#7-admin-monitoring)

## 1. Purpose

The first screen of the admin console: how the platform is doing for a chosen **period** and **city**. It shows members, events, matches, the moderation backlog, pass sales and revenue. It is built for operations, such as staffing moderation during Navratri, spotting a city with sign-ups but no events, or reconciling pass sales. It is not a people-browsing tool.

Principles:

- **Aggregates only.** Counts and sums; no names, phone numbers, messages, locations or member IDs. People are looked up through the audited user pages, never through the dashboard.
- **Role-based.** Every admin role can open the dashboard (`dashboard:view`), but each section needs the permission that already governs that data. Sections an admin can't see are `null` in the API, and their queries never run.
- **Charts only where they help decide something:** growth vs matches, moderation load, and sales during the season.
- **Export only where justified:** one CSV of **per-event sales aggregates**, for finance reconciliation (organizer settlements, GST). There is no member-level export.

## 2. Metrics and definitions

Period figures use the date range (IST, inclusive). Current figures are as of now and ignore the dates.

| Section | Metric | Definition | Window | Permission |
|---|---|---|---|---|
| Members | Total members | Accounts not deleted (any status) | current | `users:view` |
| | Joined in period | Accounts created in the range | period | |
| | Active (7 / 30 days) | Active accounts that signed in or refreshed a session in the last 7 / 30 days (`users.last_active_at`) | current | |
| | Verified | Active accounts with a photo or identity check. **Not a safety guarantee** | current | |
| | Suspended / banned | Account status | current | |
| Activity | Events in period | Published events whose date falls in the range (+ upcoming and total published) | period | `events:view` |
| | Matches in period | Matches created in the range (+ active now) | period | `users:view` |
| | Pending reports | Open or in review (+ urgent P0, + opened in period) | current | `reports:manage` |
| Passes | Bookings in period | Confirmed bookings created in the range, passes in them, bookings cancelled in the range | period | `payments:view` |
| | Gross revenue | Payments captured in the range (paise) | period | |
| | Refunds | Amounts refunded in the range | period | |
| | Net revenue | Gross − refunds | period | |

**City filter:** members, matches (either member) and reports (the reported member) use the member's profile city; events, bookings and revenue use the event's city.

**Activity tracking:** `last_active_at` is set at OTP sign-in and, at most once an hour, when a session refreshes (`auth.service.ts`), so members who stay signed in count as active.

### Access by role

| Section | super_admin | moderator | event_manager |
|---|:-:|:-:|:-:|
| Members, matches (and their charts) | ✅ | ✅ | ❌ |
| Events, per-event table | ✅ | ✅ | ✅ |
| Reports (and chart) | ✅ | ✅ | ❌ |
| Bookings, revenue (and charts), per-event sales columns | ✅ | ❌ | ✅ |
| CSV export | ✅ | ❌ | ✅ |

## 3. API

All under `/api/v1/admin/dashboard`, admin session required, `Cache-Control: no-store`.

**Filters** (all endpoints): `from`, `to` (`YYYY-MM-DD`, IST, inclusive; default the last 30 days ending today), `cityId` (UUID). The rules are `from ≤ to`, at most **366 days**, and a known city; anything else returns `400`. Unknown query parameters are rejected.

| Method | Path | Permission | Returns |
|---|---|---|---|
| GET | `/summary` | `dashboard:view` (+ per section) | `AdminDashboardSummaryDto` |
| GET | `/trends` | `dashboard:view` (+ per series) | Daily buckets (weekly when the range is over 92 days) |
| GET | `/events` | `events:view` (+ `payments:view` for sales) | Per-event rows, cursor pagination (`cursor`, `limit` ≤ 50) |
| GET | `/events/export` | `events:view` + `payments:view` | CSV download, audited, 20 per hour per IP |

### Summary

```http
GET /api/v1/admin/dashboard/summary?from=2026-10-01&to=2026-10-31&cityId=c1000000-0000-4000-8000-000000000001
Authorization: Bearer <admin access token>
```

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "period": { "from": "2026-10-01", "to": "2026-10-31", "cityId": "c1000000-…", "generatedAt": "2026-10-31T18:30:00.000Z" },
    "users": { "total": 5120, "newInPeriod": 1840, "active7d": 2210, "active30d": 3905, "verified": 1320, "suspended": 12, "banned": 4 },
    "events": { "published": 42, "inPeriod": 31, "upcoming": 9 },
    "matches": { "createdInPeriod": 960, "active": 780 },
    "reports": { "pending": 14, "pendingUrgent": 1, "openedInPeriod": 88 },
    "bookings": { "confirmedInPeriod": 610, "passesSoldInPeriod": 1175, "cancelledInPeriod": 22 },
    "revenue": { "grossPaise": 58750000, "refundedPaise": 1100000, "netPaise": 57650000, "currency": "INR" }
  }
}
```

An event manager gets `users`, `matches` and `reports` as `null`; a moderator gets `bookings` and `revenue` as `null`.

### Trends

```json
{
  "period": { "…": "…" },
  "interval": "day",
  "labels": ["2026-10-01", "2026-10-02", "…"],
  "series": {
    "signups": [52, 61, "…"],
    "matches": [20, 34, "…"],
    "reports": [2, 5, "…"],
    "bookings": null,
    "revenuePaise": null
  }
}
```

`labels[i]` is the IST date each bucket starts on (Mondays for weekly buckets). `signups` and `matches` need `users:view`, `reports` needs `reports:manage`, and `bookings` and `revenuePaise` (gross captured) need `payments:view`.

### Per-event table

Published or archived events (drafts never appear) whose date is in the range, ordered by date, newest page via `meta.nextCursor`:

```json
{
  "id": "7d3f…",
  "name": "Rangtaali Navratri Night",
  "eventDate": "2026-10-11",
  "city": "Ahmedabad",
  "status": "published",
  "going": 420,
  "interested": 180,
  "lookingForPartner": 260,
  "matches": 75,
  "sales": { "pricePaise": 49900, "capacity": 800, "bookings": 310, "passesSold": 590, "grossPaise": 29441000, "refundedPaise": 99800 }
}
```

`sales` is `null` without `payments:view`. Sales figures are lifetime totals for the event (not limited to the date range), because a pass sale belongs to its event.

### Export

`GET /events/export?from=…&to=…&cityId=…` returns `text/csv` named `event-sales-<from>-to-<to>.csv`, with up to 1,000 events. Columns: `event_id, event_name, event_date, city, status, going, interested, looking_for_partner, matches, pass_price_inr, capacity, bookings, passes_sold, gross_inr, refunded_inr, net_inr`.

- **Justification:** finance needs per-event totals to settle with organizers and file taxes; the file holds no member data.
- **Safeguards:** `payments:view` + `events:view`; each export writes `dashboard.export` to the audit log (range, city, row count); 20 per hour per IP; cells starting with `= + - @` are prefixed with `'` so spreadsheets never run them as formulas.

## 4. Admin UI

`/` (Dashboard):

- **Filters:** From / To date pickers, a city selector, and **Last 7 / 30 / 90 days** presets. Figures refresh every minute.
- **Cards** grouped as Members, Activity and Passes, showing only the sections the role allows. Cards link to the relevant queue (Reports, Payments, Events, Users).
- **Charts** (inline SVG, no chart library, with an accessible data table): new members, new matches, reports opened (moderation load), pass bookings and gross revenue. Each shows only if the role can see it.
- **Events in period** table with **Load more**, plus sales columns for `payments:view`.
- **Export event sales (CSV)** for roles with `events:view` and `payments:view`.

## 5. Implementation

| Concern | File |
|---|---|
| Queries (one aggregate SQL per section, parameterised; skipped without permission) | `apps/api/src/modules/admin/dashboard/admin-dashboard.service.ts` |
| Routes, CSV, audit | `apps/api/src/modules/admin/dashboard/admin-dashboard.routes.ts` |
| Contract | `packages/shared/src/schemas/dashboard.schema.ts`, `types/dto/dashboard.dto.ts`, `LIMITS.DASHBOARD_*` |
| Admin UI | `apps/admin/src/pages/DashboardPage.tsx`, `features/dashboard/` (`BarChart`, API), `lib/api-client.ts` (`apiDownload`) |

Queries use the existing indexes (`created_at`/status indexes on users, matches, reports, bookings; `(event_id)` partial indexes; payments by order). City filters use `EXISTS` on `user_profiles (user_id)` or the event's `city_id`. Money is summed as `bigint` in paise.

## 6. Security and privacy

- There's no member-level data in any response, chart or export. Tests assert that member IDs and phone numbers never appear.
- Permissions are checked on the server per section; the UI only hides what the API already withholds.
- Small-number caution: a city filter on a small city can reveal that "1 member was suspended". The figures stay aggregate, and member-level investigation happens on the audited user pages.
- Exports are audited and rate-limited. `no-store` on every response.

## 7. Edge cases

| Case | Behaviour |
|---|---|
| No filters | Last 30 days ending today, all cities |
| Range over 92 days | Weekly buckets (Mondays) |
| Range over 366 days, `from > to`, bad date, unknown city | `400` |
| Future dates | Allowed (e.g. upcoming events in the period) |
| Archived events | Still in the per-event table if they were published (sales history) |
| Refund in a later period than the sale | Gross counts in the capture period, the refund in its own period |

## 8. Testing

| File | Covers |
|---|---|
| `apps/api/src/modules/admin/dashboard/admin-dashboard.int.test.ts` | Access: no token / member token `401`; **section matrix per role** (super admin all; moderator no bookings/revenue; event manager no users/matches/reports); trend series per role; export `403` for moderators; `no-store`. Metrics: users (active, verified, suspended), matches, reports (urgent), events, bookings, gross/refunds/net revenue from real mocked-Razorpay purchases and a refund; no member IDs or phones in responses; city filter (member city vs event city); date range (period vs current figures); validation `400`s. Trends: 30 daily buckets, today's values, weekly buckets on Mondays. Per-event table: pagination, drafts hidden, sales only with `payments:view`, city filter, bad cursor. Export: CSV header and values, audit entry, no phone numbers; CSV formula neutralisation |
| `apps/api/src/modules/auth/auth.int.test.ts` | Session refresh records activity at most once an hour |
| `packages/shared/test/dashboard.test.ts` | Filter schema, page-size clamp, role permissions behind sections |

## 9. Known limitations

- "Active" uses the latest activity timestamp, so it is a current (7/30-day) figure, not a historical one for past periods.
- No caching: each load runs about 10 aggregate queries (fine at MVP scale; add a materialised daily rollup if it slows down).
- Revenue is gross captured amounts minus refunds; it excludes Razorpay fees and GST (see Razorpay settlements).
