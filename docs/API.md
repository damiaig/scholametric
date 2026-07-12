# API reference

Base URL: `http://localhost:3000` (all endpoints below `/api/v1` except
`/health`, which is intentionally unprefixed and public).

Unless marked **Public**, every endpoint requires `Authorization: Bearer
<accessToken>` — the global `JwtAuthGuard` 401s everything else. Errors use
one envelope everywhere:

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "path": "/api/v1/auth/me",
  "timestamp": "2026-07-12T10:00:00.000Z"
}
```

---

## Auth

### `POST /auth/login`

Public. Rate limited: 10 req/min per IP.

**Body**
```json
{ "email": "admin@sunrise.test", "password": "...", "schoolSlug": "sunrise" }
```
`schoolSlug` scopes the email lookup (the same email may exist at two
schools).

**Response `200`**
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "...",
    "email": "admin@sunrise.test",
    "firstName": "Adaobi",
    "lastName": "Nwachukwu",
    "role": "SCHOOL_ADMIN",
    "schoolId": "...",
    "school": { "id": "...", "name": "Sunrise College", "slug": "sunrise" }
  }
}
```

**Response `401`** — wrong password, wrong `schoolSlug`, unknown email, and a
disabled/soft-deleted user all return the exact same generic message (no
distinguishing responses, no timing side-channel):
```json
{ "statusCode": 401, "message": "Invalid email, password, or school.", "error": "Unauthorized", ... }
```

### `POST /auth/refresh`

Public.

**Body**: `{ "refreshToken": "..." }`

**Response `200`**: new `{ accessToken, refreshToken }` pair. The presented
refresh token is revoked on use (rotation).

**Response `401`**: unknown, expired, or already-revoked token. Presenting an
already-revoked token is treated as reuse and revokes every other active
refresh token for that user (forces re-login everywhere).

### `POST /auth/logout`

Requires a valid access token.

**Body**: `{ "refreshToken": "..." }` — revokes that refresh token.

**Response `200`**: `{ "success": true }`

### `GET /auth/me`

Requires a valid access token.

**Response `200`**
```json
{
  "id": "...",
  "email": "admin@sunrise.test",
  "firstName": "Adaobi",
  "lastName": "Nwachukwu",
  "role": "SCHOOL_ADMIN",
  "status": "ACTIVE",
  "lastLoginAt": "2026-07-12T10:00:00.000Z",
  "school": { "id": "...", "name": "Sunrise College", "slug": "sunrise", "type": "SECONDARY", "status": "ACTIVE" }
}
```

---

## Schools

### `GET /schools/search?q=`

Public. Rate limited: 30 req/min per IP. Used by the login page's school
picker.

Returns up to 10 `ACTIVE` schools matching `q` on name (ILIKE) or slug —
`{ id, name, slug }` only, nothing else. Queries under 2 characters return
`[]`.

**Response `200`**
```json
[{ "id": "...", "name": "Sunrise College", "slug": "sunrise" }]
```

---

## Misc

### `GET /health`

Public. No authentication required.

**Response `200`**
```json
{
  "status": "ok",
  "db": true,
  "redis": true
}
```

`status` is `"ok"` only when both `db` and `redis` are `true`; otherwise
`"error"`. `db`/`redis` reflect a live connectivity check performed on every
request (no caching).
