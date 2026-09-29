# Event API

> Related: [Event management](event-management.md), [Organizer management](organizer-management.md), [Authorization](../auth/authorization.md). All paths are under `/api/v1`. Responses use the standard envelope `{ success, message, data, meta? }`; errors are `{ success: false, message, error: { code, details } }`.

## Conventions

- **Dates and times** are India Standard Time: `eventDate` = `YYYY-MM-DD`, `startTime`/`endTime` = `HH:MM` (24-hour). An end time earlier than the start time means the event ends after midnight. `startsAt`/`endsAt` are ISO instants (UTC).
- **Pagination** is keyset-based: pass `meta.nextCursor` back as `cursor`. `nextCursor: null` means the last page. A cursor is tied to its `sort`; reusing it with a different sort returns `400`.
- **`limit`**: 1–50 (public default 12, admin default 20).
- Unknown query keys and body keys are rejected (`400 VALIDATION_ERROR`).

## Public endpoints

No authentication. Rate limit: **120 requests/minute per IP**. `Cache-Control: public, max-age=60`.

### `GET /events`

Published events that have **not ended**, in active cities.

| Query | Type | Description |
|---|---|---|
| `cityId` | uuid | Only this city |
| `from` | `YYYY-MM-DD` | Starts on or after this IST day |
| `to` | `YYYY-MM-DD` | Starts on or before this IST day (`from ≤ to`) |
| `sort` | `date_asc` (default) \| `date_desc` | By start time |
| `cursor`, `limit` | | Pagination |

```http
GET /api/v1/events?cityId=c1000000-0000-4000-8000-000000000001&from=2026-10-10&to=2026-10-12&limit=12
```

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "7d3f…",
      "slug": "rangtaali-navratri-night-k3v9qa",
      "name": "Rangtaali Navratri Night",
      "city": { "id": "c1000000-0000-4000-8000-000000000001", "name": "Ahmedabad" },
      "area": { "id": "a2000000-0001-4000-8000-000000000001", "name": "Navrangpura" },
      "venueName": "GMDC Ground",
      "eventDate": "2026-10-11",
      "startTime": "20:00",
      "endTime": "01:00",
      "startsAt": "2026-10-11T14:30:00.000Z",
      "endsAt": "2026-10-11T19:30:00.000Z",
      "hasEnded": false,
      "imageUrl": "https://res.cloudinary.com/…/w_800,h_450,c_fill,g_auto/…",
      "isVerified": true,
      "organizer": { "id": "e0c0…", "name": "Rangtaali Events", "isVerified": true },
      "hasTicketUrl": true
    }
  ],
  "meta": { "nextCursor": "WyJkYXRlX2FzYyIsIjIwMjYtMTAtMTFUMTQ6MzA6MDAuMDAwWiIsIjdkM2Yi…" }
}
```

### `GET /events/:idOrSlug`

A published event by UUID or slug. Drafts, archived and unknown events → `404 NOT_FOUND`. Ended events are returned with `hasEnded: true`.

Adds to the card fields: `description`, `venueAddress`, `ticketUrl`, and the public organizer profile:

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "7d3f…",
    "slug": "rangtaali-navratri-night-k3v9qa",
    "name": "Rangtaali Navratri Night",
    "description": "Nine nights of live garba…",
    "venueName": "GMDC Ground",
    "venueAddress": "Helmet Circle, Ahmedabad",
    "ticketUrl": "https://tickets.example.com/rangtaali",
    "imageUrl": "https://res.cloudinary.com/…/w_1600,h_900,c_fill,g_auto/…",
    "organizer": {
      "id": "e0c0…",
      "name": "Rangtaali Events",
      "isVerified": true,
      "description": "Community Navratri nights since 2010.",
      "websiteUrl": "https://example.com/rangtaali",
      "instagramHandle": "rangtaali"
    },
    "…": "all card fields"
  }
}
```

**Never returned publicly:** organizer contact name/email/phone, internal notes, event status, admin IDs/names, image public IDs.

## Admin events

Admin access token required (`Authorization: Bearer …`). Member tokens → `401`. `Cache-Control: no-store`.

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/admin/events` | `events:view` | List (filters below) |
| GET | `/admin/events/:eventId` | `events:view` | Detail |
| POST | `/admin/events` | `events:manage` | Create a **draft** → `201` |
| PATCH | `/admin/events/:eventId` | `events:manage` | Partial update (not archived) |
| POST | `/admin/events/:eventId/image` | `events:manage` | Multipart field `image` (JPEG/PNG/WebP ≤5 MB) |
| DELETE | `/admin/events/:eventId/image` | `events:manage` | Remove image |
| POST | `/admin/events/:eventId/publish` | `events:manage` | draft → published |
| POST | `/admin/events/:eventId/unpublish` | `events:manage` | published → draft |
| POST | `/admin/events/:eventId/verify` / `unverify` | `events:manage` | Toggle the verified-event badge |
| POST | `/admin/events/:eventId/archive` | `events:manage` | Soft delete |
| POST | `/admin/events/:eventId/restore` | `events:manage` | archived → draft |
| DELETE | `/admin/events/:eventId` | `events:manage` | Hard delete, **never-published events only** |

### `GET /admin/events` query

| Query | Description |
|---|---|
| `q` | Name contains (case-insensitive), exact slug, or exact event ID |
| `status` | `draft` \| `published` \| `archived` |
| `cityId`, `organizerId` | UUID filters |
| `verified` | `true` \| `false` |
| `from`, `to` | IST start-day range |
| `sort` | `created_desc` (default) \| `date_asc` \| `date_desc` \| `name_asc` |
| `cursor`, `limit` | Pagination |

List items (`AdminEventListItemDto`): `id, slug, name, status, isVerified, city, organizer {id,name,isVerified}, eventDate, startTime, endTime, startsAt, endsAt, hasEnded, thumbnailUrl, createdAt, updatedAt`.

Detail (`AdminEventDetailDto`) adds: `description, area, venueName, venueAddress, ticketUrl, imageUrl, verifiedAt, publishedAt, firstPublishedAt, archivedAt, createdBy {id,name}, updatedBy {id,name}, canDelete`.

### `POST /admin/events`

```json
{
  "name": "Rangtaali Navratri Night",
  "description": "Nine nights of live garba with a traditional orchestra.",
  "organizerId": "e0c0a1b2-0001-4000-8000-000000000001",
  "cityId": "c1000000-0000-4000-8000-000000000001",
  "areaId": "a2000000-0001-4000-8000-000000000001",
  "venueName": "GMDC Ground",
  "venueAddress": "Helmet Circle, Ahmedabad",
  "eventDate": "2026-10-11",
  "startTime": "20:00",
  "endTime": "01:00",
  "ticketUrl": "https://tickets.example.com/rangtaali"
}
```

`areaId` and `ticketUrl` are optional (`null`/empty clears). Response `201` with `AdminEventDetailDto` (`status: "draft"`).

Validation errors (`400 VALIDATION_ERROR`, `details[].path`): past date or >2 years ahead (`eventDate`), equal times (`endTime`), non-`https` link (`ticketUrl`), contact details in `description`, inactive/unknown city (`cityId`), area not in city (`areaId`), unknown/archived organizer (`organizerId`), unknown keys such as `status`, `isVerified`, `slug`.

### `PATCH /admin/events/:eventId`

Any subset of the create fields (at least one). Only changed fields are written. Changing a **material** field (organizer, city, area, venue, date, times, ticket link) clears `isVerified`. Changing the city without `areaId` clears the area. Archived events → `409`.

```json
{ "ticketUrl": "https://tickets.example.com/new" }
```

### Lifecycle responses

All return `200` with the updated `AdminEventDetailDto`, or `409 CONFLICT` for an invalid transition, e.g.:

```json
{
  "success": false,
  "message": "Events that have been published cannot be deleted. Archive it instead.",
  "error": { "code": "CONFLICT", "details": null }
}
```

`DELETE /admin/events/:eventId` → `200 { "id": "…", "deleted": true }`.

## Admin organizers

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/admin/organizers` | `events:view` | List: `q` (name contains), `status` (`active`\|`archived`), `verified`, `cursor`, `limit`. Sorted by name |
| GET | `/admin/organizers/options` | `events:view` | Active organizers for pickers: `[{ id, name, isVerified }]` |
| GET | `/admin/organizers/:organizerId` | `events:view` | Detail. `contact` is `null` without `events:manage` |
| POST | `/admin/organizers` | `events:manage` | Create → `201` |
| PATCH | `/admin/organizers/:organizerId` | `events:manage` | Partial update (not archived) |
| POST | `/admin/organizers/:organizerId/verify` / `unverify` | `events:manage` | Verified-organizer badge |
| POST | `/admin/organizers/:organizerId/archive` / `restore` | `events:manage` | Archive refused while upcoming published events exist |

### `POST /admin/organizers`

```json
{
  "name": "Rangtaali Events",
  "description": "Community Navratri nights since 2010.",
  "websiteUrl": "https://example.com/rangtaali",
  "instagramHandle": "@rangtaali",
  "contactName": "Asha Patel",
  "contactEmail": "asha@example.com",
  "contactPhone": "+91 98765 43210",
  "notes": "Verified by phone on 2026-09-20."
}
```

Response (`AdminOrganizerDto`, as seen by an event manager):

```json
{
  "success": true,
  "message": "Organizer created",
  "data": {
    "id": "e0c0…",
    "name": "Rangtaali Events",
    "isVerified": false,
    "status": "active",
    "createdAt": "2026-09-29T06:00:00.000Z",
    "description": "Community Navratri nights since 2010.",
    "websiteUrl": "https://example.com/rangtaali",
    "instagramHandle": "rangtaali",
    "verifiedAt": null,
    "archivedAt": null,
    "updatedAt": "2026-09-29T06:00:00.000Z",
    "contact": {
      "contactName": "Asha Patel",
      "contactEmail": "asha@example.com",
      "contactPhone": "+91 98765 43210",
      "notes": "Verified by phone on 2026-09-20."
    },
    "eventCounts": { "total": 0, "upcomingPublished": 0 }
  }
}
```

Duplicate name (case-insensitive) → `409 CONFLICT` with `details: [{ "path": "name", … }]`. Changing `name`, `websiteUrl` or `instagramHandle` clears verification.

## Error codes

| Code | Status | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid body/query/params, invalid cursor, business validation (dates, location, organizer) |
| `UNAUTHENTICATED` | 401 | Missing/invalid admin token, member token on admin routes |
| `FORBIDDEN` | 403 | Admin lacks `events:view` / `events:manage` |
| `NOT_FOUND` | 404 | Unknown event/organizer; non-published event on public routes |
| `CONFLICT` | 409 | Invalid lifecycle transition, duplicate organizer name, archive blocked, edit of archived record |
| `INVALID_IMAGE` / `PAYLOAD_TOO_LARGE` | 400 / 413 | Image upload problems |
| `RATE_LIMITED` | 429 | Public event rate limit |

## Testing

See [event management §11](event-management.md#11-testing). Quick manual check with the seeded data:

```bash
curl "http://127.0.0.1:4000/api/v1/events?limit=2"
curl "http://127.0.0.1:4000/api/v1/events/rangtaali-navratri-night-dev001"
```
