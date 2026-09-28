# Profile Images & Cloudinary

> Related: [User profile](user-profile.md), [Profile validation §4](profile-validation.md#4-image-rules), [Privacy rules](privacy-rules.md), [Environment variables](../setup/environment-variables.md)

## 1. Pipeline

```mermaid
sequenceDiagram
    actor M as Member
    participant W as Web app
    participant A as API
    participant S as Media storage (Cloudinary)
    participant DB as PostgreSQL

    M->>W: Choose photo
    W->>W: Pre-check type, size ≤ 5 MB, ≥ 400×400
    W->>A: POST /me/profile/image (multipart "image")
    A->>A: multer: 1 file, ≤ 5 MB, in memory only
    A->>A: sharp: decode → verify format & size → rotate → resize ≤ 1600 px → JPEG, ALL metadata dropped
    A->>S: Signed server-side upload (random public ID)
    A->>DB: BEGIN; lock profile; set image_*; revoke photo badge; sync onboarding; COMMIT
    A->>S: Delete the previous image (after commit)
    A-->>W: 200 MyProfileDto (card + thumbnail URLs)
```

Failure handling:

| Failure | Result |
|---|---|
| Invalid file | `400`/`413`. Nothing stored |
| Storage upload fails | `503 SERVICE_UNAVAILABLE`. Profile unchanged |
| Database step fails after upload | The new asset is deleted (compensation), and the error is returned |
| Deleting the old asset fails | Logged with the opaque public ID only. The profile is already correct |

## 2. Privacy guarantees

- **EXIF/GPS stripping:** the image is re-encoded by sharp without calling `keepMetadata()`/`withExif()`, so camera data, **GPS coordinates**, XMP and comments are removed. The stored file is the processed one, never the original. Covered by a unit test and an integration test (a GPS-tagged input produces a stored image with no EXIF) and an end-to-end check.
- **Random public IDs** (`randomToken(16)`): URLs reveal nothing about the member (no user ID, no name).
- **Server-side signed uploads only:** the API secret never leaves the server. The browser never gets an upload preset or signature.
- **Processed in memory:** uploads are never written to the API server's disk.
- Delivered images are transformed renditions (`card` 600×800 face-crop, `thumbnail` 160×160) with `f_auto,q_auto`.

## 3. Configuration

| Variable | Default | Notes |
|---|---|---|
| `MEDIA_STORAGE` | `local` | `cloudinary` \| `local`. **`local` is refused unless `APP_ENV=development`** |
| `CLOUDINARY_CLOUD_NAME` | — | Required when `MEDIA_STORAGE=cloudinary` |
| `CLOUDINARY_API_KEY` | — | Required when `MEDIA_STORAGE=cloudinary` |
| `CLOUDINARY_API_SECRET` | — | Required when `MEDIA_STORAGE=cloudinary`. **Secret, server only** (never `VITE_*`) |
| `CLOUDINARY_FOLDER_PREFIX` | `garba-partner` | Assets go to `<prefix>/<APP_ENV>/profile-images/<random>` |

### Cloudinary account setup

1. Create a Cloudinary account (or a sub-account per environment).
2. **Settings → Security:** enable "Strict transformations", and allow only the named transformations the API uses (`c_fill,g_face,w_600,h_800` and `w_160,h_160`, plus `f_auto,q_auto`). This stops arbitrary transformation abuse.
3. **Settings → Upload:** no unsigned upload presets. The API signs every upload.
4. Put the credentials in the server `.env` (mode 600). Rotate them if staff change or exposure is suspected.
5. Optional: the paid automated-moderation add-on can pre-flag images for the moderation queue (decision pending, [MVP scope §7](../product/MVP-scope.md#7-open-questions-to-resolve-before-or-during-phase-0)).

## 4. Local development without Cloudinary

With `MEDIA_STORAGE=local` (the default in `.env.example`):

- Processed images are written to `apps/api/.local-media/<random>.jpg` (git-ignored).
- The API serves them at `GET /api/v1/dev-media/<file>` (static, no directory index, dotfiles denied). The web app reaches them through the Vite proxy like any other API path.
- Renditions aren't resized per variant locally (the stored file is already ≤ 1600 px).
- The same validation and EXIF stripping run as in production. Only the storage differs.

To test real Cloudinary locally, set `MEDIA_STORAGE=cloudinary` and the three credentials. Use a separate development cloud or folder prefix.

## 5. Implementation

| File | Role |
|---|---|
| `apps/api/src/middlewares/upload.ts` | multer: memory storage, 1 file, 5 MB, declared-type filter, error mapping |
| `apps/api/src/lib/image.ts` | `processProfileImage()`: decode, validate, rotate, resize, strip, JPEG |
| `apps/api/src/providers/media/media.storage.ts` | `MediaStorage` interface (`upload`, `destroy`, `url`) |
| `apps/api/src/providers/media/cloudinary.storage.ts` | Cloudinary v2 SDK: `upload_stream`, `destroy` (with CDN invalidation), `url` |
| `apps/api/src/providers/media/local.storage.ts` | Development disk storage |
| `apps/api/src/modules/profiles/profile.service.ts` | Upload/replace/delete orchestration, compensation, badge revocation |

Tests use an in-memory fake storage (`createFakeMediaStorage()` in `apps/api/src/test/helpers.ts`), so no network access or credentials are needed.

## 6. Retention

| Event | Asset |
|---|---|
| Photo replaced | Old asset deleted right after the new one is saved |
| Photo removed | Asset deleted |
| Account erased (later phase) | Asset deleted as part of the purge job |
| Orphaned asset (a deletion failed) | Logged. A cleanup job will reconcile storage with the database (planned) |
