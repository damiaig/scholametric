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

List endpoints below use the shared pagination shape: query `?page=&pageSize=`
(`pageSize` ≤ 100, default 20), response `{ items, total, page, pageSize }`,
ordering always tiebreaks on `id`.

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

### `POST /schools`

`SUPER_ADMIN` only.

Creates the school and its first `SCHOOL_ADMIN` user in one transaction. If
the slug already exists, nothing is created (409) — not even the admin user.

**Body**
```json
{
  "name": "Riverside Academy",
  "slug": "riverside",
  "type": "SECONDARY",
  "admin": { "email": "admin@riverside.test", "firstName": "...", "lastName": "...", "password": "..." }
}
```

**Response `201`**: the school row plus `{ admin: { id, email, firstName, lastName, role } }`.

**Response `409`**: slug already in use.

### `GET /schools`

`SUPER_ADMIN` only. Paginated list of every school (not just `ACTIVE` ones —
this is the platform directory, distinct from the public `/schools/search`).

### `GET /schools/:id`

`SUPER_ADMIN` only. `404` if the id doesn't exist.

### `PATCH /schools/:id`

`SUPER_ADMIN` only. Body: any of `name`, `type`, `address`, `phone`, `email`,
`status` — `slug` is immutable and not accepted here.

---

## School setup

`SCHOOL_ADMIN` only, all endpoints below. Every resource is scoped to the
caller's own school via the access token's `schoolId` — never from the
request body/query/params. Fetching or patching another school's resource by
its real ID returns `404`, not `403`. Every mutation below writes an
`audit_logs` row automatically (actor + school from the JWT).

### `GET /sessions`

Paginated, ordered by `startsOn` descending.

### `POST /sessions`

Body: `{ name, startsOn, endsOn }` (dates as `YYYY-MM-DD`). `409` on a
duplicate `name` within the school.

### `PATCH /sessions/:id`

Body: any of `name`, `startsOn`, `endsOn`. `isCurrent` is not settable here —
only `/activate` changes it.

### `POST /sessions/:id/activate`

Sets `isCurrent: true` on this session and `false` on every other session in
the school, atomically (deactivate-then-activate in one transaction, so the
one-current-per-school constraint is never violated mid-flight).

**Response `200`**: the activated session.

### `GET /terms?sessionId=`

`sessionId` (query, required) scopes the list to one session. Paginated,
ordered by `startsOn` ascending.

### `POST /terms`

Body: `{ sessionId, name, startsOn, endsOn }` — `name` is one of `FIRST`,
`SECOND`, `THIRD`. `404` if `sessionId` doesn't belong to the caller's school.
`409` on a duplicate `name` within the session.

### `POST /terms/:id/activate`

Same atomic deactivate-then-activate pattern as sessions, scoped to the
term's session (one current term per session).

### `GET /class-levels`

Paginated, ordered by `rank` ascending.

### `POST /class-levels`

Body: `{ name, rank }`. `409` on a duplicate `name` within the school (the
same name in a different school is fine).

### `PATCH /class-levels/:id`

Body: any of `name`, `rank`.

### `GET /class-arms?classLevelId=`

`classLevelId` (query, optional) filters to one class level. Paginated,
ordered by `name` ascending.

### `POST /class-arms`

Body: `{ name, classLevelId }`. `404` if `classLevelId` doesn't belong to the
caller's school. `409` on a duplicate `name` within the class level.

### `PATCH /class-arms/:id`

Body: any of `name`, `classLevelId`. If `classLevelId` is provided, it must
belong to the caller's school (`404` otherwise).

---

## Students

`SCHOOL_ADMIN` full access; `TEACHER` read-only (every mutation `403`s);
`SUPER_ADMIN` has no access at all (`403`, not `404` — see docs/DECISIONS.md).
Every resource is scoped to the caller's school via the access token, same as
School setup above. Every mutation writes an `audit_logs` row automatically
(actor + school from the JWT, `metadata` = the raw request body).

### `GET /students?search=&classArmId=&status=&page=&pageSize=`

Paginated, ordered by `lastName`, `firstName`, tiebreak `id`.

- `search` — ILIKE (trigram-indexed) against first name, last name, **or**
  admission number.
- `classArmId` — filters to students currently enrolled (current session) in
  that class arm.
- `status` — one of `ACTIVE`, `SUSPENDED`, `GRADUATED`, `TRANSFERRED`,
  `WITHDRAWN`. Omitted: defaults to everything **except** `WITHDRAWN`.
  Soft-deleted rows (`deletedAt`) are always excluded regardless.

Each item includes `currentEnrollment` (same shape as `GET /students/:id`
below) — added in step 7 so the students list page can show class/level per
row without an extra request per student.

### `GET /students/:id`

Full profile plus `currentEnrollment` (`{ classArm: { classLevel }, session }`
for the current session, or `null`). `404` outside the caller's school.

### `POST /students`

Body: bio + guardian fields, `{ classArmId }`, optional `admissionNumber`.
Creates the student and its enrollment in the current session in one
transaction.

If `admissionNumber` is omitted, one is generated:
`{first 3 letters of the school's slug, uppercased}/{session start
year}/{4-digit sequence}`, e.g. `SUN/2026/0026` — sequence resets per
(school, year) and is safe under concurrent creates (see docs/DECISIONS.md).
A supplied `admissionNumber` is used as-is.

**Response `201`**: the created student row.

**Response `404`**: `classArmId` doesn't belong to the caller's school.

**Response `409`**: `admissionNumber` already exists in this school (a
generated number never collides; only a caller-supplied one can).

### `PATCH /students/:id`

Bio/guardian fields only — not `classArmId` (`/transfer-class`), not `status`
(`/withdraw`), not `admissionNumber` (immutable).

### `POST /students/:id/withdraw`

Body: `{ reason }`. Sets `status: WITHDRAWN`. `reason` is not a student
column — it's recorded in the audit log's `metadata`.

### `POST /students/:id/transfer-class`

Body: `{ classArmId }`. Updates the student's enrollment for the current
session. `404` if `classArmId` isn't in the caller's school.

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
