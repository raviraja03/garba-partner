# Authorization

> Related: [Authentication](authentication.md), [Security architecture §5](../architecture/security-architecture.md#5-authorization-and-the-interaction-gate), [Application architecture §7.3](../architecture/application-architecture.md#73-admin-role-permission-matrix)

Authorization is **always enforced by the API**. The frontends only hide what the user can't use.

## 1. Middleware

| Middleware | File | Use on | Rejects with |
|---|---|---|---|
| `authenticateMember` | `middlewares/authenticate.ts` | Every member endpoint that needs a login | `401 UNAUTHENTICATED` (no, invalid, expired or wrong-audience token; revoked or expired session; deleted user), `403 ACCOUNT_BANNED` |
| `requireActiveMember` | `middlewares/authorize.ts` | Every endpoint that affects or exposes other members (discovery, interests, chat, …) | `403 ACCOUNT_SUSPENDED`, `ACCOUNT_PENDING_DELETION`, `ACCOUNT_BANNED`, or `FORBIDDEN` ("complete your profile") when onboarding is incomplete |
| `authenticateAdmin` | `middlewares/authenticate.ts` | Every admin endpoint | `401 UNAUTHENTICATED` (includes member tokens and disabled admins) |
| `requirePermission(p)` | `middlewares/authorize.ts` | Every admin endpoint, with the specific permission | `403 FORBIDDEN` |
| `requireCsrfHeader(v, origins)` | `middlewares/csrf.ts` | Cookie-authenticated endpoints (refresh) | `403 FORBIDDEN` |

The middleware attaches `req.auth` (member: `userId`, `sessionId`, `status`, `onboarded`) or `req.admin` (admin: `adminId`, `sessionId`, `role`). Controllers read them through `memberAuth(req)` / `adminAuth(req)`.

### Typical route declarations

```ts
// Member route that touches other members
router.post('/interests', authenticateMember, requireActiveMember, controller.sendInterest);

// Admin route
router.post(
  '/users/:id/sanctions',
  authenticateAdmin,
  requirePermission('users:sanction'),
  controller.sanction,
);
```

## 2. Member status matrix

| Endpoint group | active | suspended | pending_deletion | banned |
|---|:-:|:-:|:-:|:-:|
| `send-otp` / `verify-otp` | ✅ | ✅ | ✅ | ❌ (403 at verify) |
| `refresh`, `logout`, `me` | ✅ | ✅ | ✅ | ❌ |
| Social endpoints (`requireActiveMember`) | ✅ (and onboarded) | ❌ | ❌ | ❌ |

## 3. Admin roles and permissions

Defined once in `packages/shared/src/constants/admin.ts` (`ROLE_PERMISSIONS`). **Route code checks permissions, never role names**, so a role can change without touching routes.

| Permission | super_admin | moderator | event_manager |
|---|:-:|:-:|:-:|
| `dashboard:view` | ✅ | ✅ | ✅ |
| `users:view` | ✅ | ✅ | ❌ |
| `users:sanction` | ✅ | ✅ | ❌ |
| `users:reveal_phone` | ✅ | ❌ | ❌ |
| `reports:manage` | ✅ | ✅ | ❌ |
| `verifications:review` | ✅ | ✅ | ❌ |
| `photos:review` | ✅ | ✅ | ❌ |
| `events:view` | ✅ | ✅ | ✅ |
| `events:manage` | ✅ | ❌ | ✅ |
| `locations:manage` | ✅ | ❌ | ✅ |
| `audit:view` | ✅ | ❌ | ❌ |
| `admins:manage` | ✅ | ❌ | ❌ |

`GET /api/v1/admin/auth/me` returns the admin's `permissions`. The admin panel shows only permitted navigation items, and `RequireAdmin permission="…"` redirects on the client. This is UX only.

## 4. User/admin separation

| Mechanism | Guarantee |
|---|---|
| Separate tables (`users` vs `admin_users`) and separate session tables | No shared identity, so a member can never "become" an admin |
| Separate JWT secrets **and** audiences | A token from one side is rejected by the other side's middleware (tested both ways) |
| Separate cookies and cookie paths (`gp_rt` on `/api/v1/auth`, `gp_admin_rt` on `/api/v1/admin/auth`) | Refresh tokens are never sent to the other side's endpoints |
| Separate CSRF header values (`gp-web` / `gp-admin`) and allowed origins | A member page can't refresh an admin session |
| Separate route prefixes (`/api/v1/auth`, `/api/v1/admin/auth`) | Nginx will expose only the admin prefix on the admin host |

## 5. Frontend route protection

| App | Guard | Behaviour |
|---|---|---|
| Web | `RequireAuth` | Loading → spinner. Anonymous → `/login` (remembers the target path). Authenticated → page |
| Web | `PublicOnly` | Authenticated members skip `/login` and `/login/verify` |
| Admin | `RequireAdmin` / `RequireAdmin permission="…"` | Anonymous → `/login`. Missing permission → dashboard |
| Admin | `PublicOnly` | Authenticated admins skip `/login` |

## 6. Rules for new endpoints

1. Choose the authentication middleware (member or admin). Unauthenticated endpoints must be explicitly justified (like `send-otp`).
2. Member endpoints that involve another member → add `requireActiveMember`, **and** apply the interaction gate (blocks) in the service.
3. Admin endpoints → add `requirePermission('<specific permission>')`. Add a new permission to the shared matrix when needed (and to this table).
4. Scope every query by the caller (`WHERE user_id = :userId`) to prevent IDOR.
5. Add tests for 401 (no token), 403 (wrong role or status) and the success path.
