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
  "school": {
    "id": "...",
    "name": "Sunrise College",
    "slug": "sunrise",
    "type": "SECONDARY",
    "status": "ACTIVE",
    "address": null,
    "phone": null,
    "email": null
  }
}
```
`school.address`/`phone`/`email` added in step 8 (nullable) so the
read-only `/settings/school` profile page has data to show — see
docs/DECISIONS.md.

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

`SUPER_ADMIN`, `PROPRIETOR`, or `SCHOOL_ADMIN` (RBAC split added in v0.2,
SPEC_V0.2.md §2). `SUPER_ADMIN` may PATCH any school with the full body:
`name`, `type`, `address`, `phone`, `email`, `status` (`slug` is immutable
and not accepted here, by anyone).

`PROPRIETOR`/`SCHOOL_ADMIN` may only PATCH **their own** school — `:id` must
equal their JWT `schoolId`, else `404` (not `403`, same cross-tenant
convention as everywhere else) — and only `name`/`address`/`phone`/`email`;
sending `type` or `status` is `400`. No `audit_logs` row is written for this
endpoint by anyone, including the school-level path: the interceptor logs
under the actor's own `schoolId`, which is right when a school user patches
themselves but wrong when `SUPER_ADMIN` patches some other school (same
reason the whole controller was excluded from auditing originally).

---

## School setup

`PROPRIETOR` and `SCHOOL_ADMIN` (added in v0.2 — PROPRIETOR is a superset of
SCHOOL_ADMIN within their school per SPEC_V0.2.md §2). Every resource is scoped to the
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

### `GET /sessions/:id/activation-preview`

Added in v0.2 (SPEC_V0.2.md §2 — the acceptance run showed activating an
empty session silently was a real footgun). Response:
```json
{
  "targetSession": { "name": "2027/2028", "enrollmentCount": 0 },
  "currentSession": { "name": "2026/2027", "enrollmentCount": 125 }
}
```
`currentSession` is `null` if the school has no current session yet.
`enrollmentCount` is the raw `student_enrollments` row count for that
session (not filtered by student status).

### `POST /sessions/:id/activate`

Body: `{ confirmName }`, added in v0.2 — must equal the **target** session's
(`:id`'s) `name` exactly, or `400` with a clear message naming the required
value. Sets `isCurrent: true` on this session and `false` on every other
session in the school, atomically (deactivate-then-activate in one
transaction, so the one-current-per-school constraint is never violated
mid-flight). Term activation is unchanged — no confirmation required there.

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

### `POST /class-levels/:id/arms`

Added in v0.2 (SPEC_V0.2.md §2) — the natural "add arm B to JSS 1" flow.
Body: `{ name }`; `classLevelId` comes from the path, wraps the same
`POST /class-arms` logic (`409` on a duplicate name within the level).

### `GET /class-arms?classLevelId=`

`classLevelId` (query, optional) filters to one class level. Paginated,
ordered by `name` ascending.

### `POST /class-arms`

Body: `{ name, classLevelId }`. `404` if `classLevelId` doesn't belong to the
caller's school. `409` on a duplicate `name` within the class level.

### `PATCH /class-arms/:id`

Body: any of `name`, `classLevelId`. If `classLevelId` is provided, it must
belong to the caller's school (`404` otherwise).

### `PUT /class-arms/:id/class-teacher`

Added in v0.2 step 2. Body: `{ teacherUserId }`. Upsert-replace for the
**current session** — reassigning simply overwrites the existing row (no
`409`, unlike subject assignments below). `teacherUserId` must resolve to a
`TEACHER` with a `staff_profile` in the caller's school (`404` otherwise,
same as any other cross-tenant foreign key in this API).

### `DELETE /class-arms/:id/class-teacher`

Unassigns the current session's class teacher. `404` if the arm has none
this session (including a second `DELETE` in a row).

### `GET /class-arms/:id`

Added in v0.2 (SPEC_V0.2.md §2) — arm detail for the Classes tab. Unlike the
plain list above, also readable by `TEACHER` (RBAC matrix "View
teachers/classes/subjects"). Query: `page`/`pageSize` for the students list.

**Response `200`**
```json
{
  "id": "...", "name": "A",
  "classLevel": { "id": "...", "name": "JSS 1", "rank": 1 },
  "classTeacher": { "userId": "...", "firstName": "Bola", "lastName": "Ogundare" },
  "subjectTeachers": [{ "id": "...", "subjectId": "...", "subjectName": "Mathematics", "teacherUserId": "...", "teacherFirstName": "Bola", "teacherLastName": "Ogundare" }],
  "students": { "items": [...], "total": 5, "page": 1, "pageSize": 20 }
}
```
`classTeacher`/`subjectTeachers`/`students` all reflect the **current
session** only; if the school has none yet, `classTeacher` is `null` and
`subjectTeachers`/`students.items` are empty rather than erroring.
`subjectTeachers[].id` (the assignment's own id) was added in v0.2 step 6
so the arm page's remove action can target
`DELETE /subject-assignments/:id` directly — mirrors the same fix already
made to `GET /teachers/:userId`'s `subjectsTaught` in step 5.

---

## Students

`PROPRIETOR`/`SCHOOL_ADMIN` full access; `TEACHER` read-only (every mutation `403`s);
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

Each item also includes `primaryGuardian`: `{ guardianId, firstName,
lastName, phone } | null` — the student's primary guardian, cheap enough to
compute per row for the list's name/phone column without pulling the full
`guardians[]` roster (that's `GET /students/:id`'s job). `null` if the
student somehow has no guardians at all.

### `GET /students/:id`

Full profile plus `currentEnrollment` (`{ classArm: { classLevel }, session }`
for the current session, or `null`), plus `guardians` (v0.2 step 4 — see the
Guardians section below): every linked guardian, primary first, shaped as
`{ guardianId, relationship, isPrimary, firstName, lastName, phone, email,
address }`. `404` outside the caller's school.

### `POST /students`

**Breaking change, v0.2 step 4** (see docs/DECISIONS.md): body is bio fields,
`{ classArmId }`, optional `admissionNumber`, and **`guardians: [{...}]`**
(min 1) — `guardianName`/`guardianPhone`/`guardianEmail`/`address` are no
longer accepted here. Each entry in `guardians[]` is either:
- `{ guardianId, relationship }` — link an existing guardian (the sibling
  case: reuse a guardian already in this school), or
- `{ firstName, lastName, phone, relationship, email?, address? }` — create
  a new guardian.

`relationship` is required on every entry either way. Exactly one entry may
carry `isPrimary: true`; if none do, the first entry becomes primary. Two
explicit primaries is a `400`. Creates the student, its enrollment, and every
guardian link in one transaction — a failure partway rolls back everything,
so no orphan guardian rows.

Every seeded/pre-v0.2 student's frozen `guardianName`/`guardianPhone`/
`guardianEmail`/`address` columns still exist (`NOT NULL`, no migration this
step) and are still populated on create — from the **resolved primary
guardian's** own data, not the raw request — so the old columns keep showing
real info for any code still reading them.

If `admissionNumber` is omitted, one is generated:
`{first 3 letters of the school's slug, uppercased}/{session start
year}/{4-digit sequence}`, e.g. `SUN/2026/0026` — sequence resets per
(school, year) and is safe under concurrent creates (see docs/DECISIONS.md).
A supplied `admissionNumber` is used as-is.

**Response `201`**: the created student row (bio + legacy guardian columns;
call `GET /students/:id` for the full `guardians[]` array).

**Response `400`**: two guardians both marked `isPrimary`, or a guardian
entry with neither `guardianId` nor `firstName`/`lastName`/`phone`.

**Response `404`**: `classArmId`, or a supplied `guardianId`, doesn't belong
to the caller's school.

**Response `409`**: `admissionNumber` already exists in this school (a
generated number never collides; only a caller-supplied one can).

### `PATCH /students/:id`

**Breaking change, v0.2 step 4**: bio fields only
(`firstName`/`lastName`/`middleName`/`gender`/`dateOfBirth`) — not
`classArmId` (`/transfer-class`), not `status` (`/withdraw`), not
`admissionNumber` (immutable), and no longer any guardian field. Edit a
guardian's own data via `PATCH /guardians/:id`, or the set of guardians via
the `/students/:id/guardians` endpoints below.

### `POST /students/:id/withdraw`

Body: `{ reason }`. Sets `status: WITHDRAWN`. `reason` is not a student
column — it's recorded in the audit log's `metadata`.

### `POST /students/:id/transfer-class`

Body: `{ classArmId }`. Updates the student's enrollment for the current
session. `404` if `classArmId` isn't in the caller's school.

---

## Guardians (v0.2 step 4, SPEC_V0.2.md §2)

`PROPRIETOR`/`SCHOOL_ADMIN` full access; `TEACHER` read-only (`GET` only —
every mutation `403`s); `SUPER_ADMIN` no access (`403`). Every mutation
writes an `audit_logs` row. A `Guardian` may be linked to more than one
`Student` (siblings) via `student_guardians`; editing the guardian record
updates every student it's linked to at once.

### `GET /students/:id/guardians`

Every link for the student, primary first: `{ id, guardianId, relationship,
isPrimary, firstName, lastName, phone, email, address }[]`. `404` outside the
caller's school.

### `POST /students/:id/guardians`

Add a guardian to an existing student — same two modes as `POST /students`'s
`guardians[]` entries (`guardianId` to link existing, or
`firstName`/`lastName`/`phone` to create new), `relationship` always
required. **No `isPrimary` field exists on this endpoint** — adding a
guardian to a student who already has one or more never steals primary; the
server sets `isPrimary: true` only if this is the student's first-ever
guardian link. Reassigning primary is only possible via the `/primary`
endpoint below.

**Response `201`**: the new link (`StudentGuardianSummary` shape, see `GET`
above).

**Response `400`**: neither `guardianId` nor `firstName`/`lastName`/`phone`
given.

**Response `404`**: the student, or a supplied `guardianId`, isn't in the
caller's school.

### `DELETE /students/:id/guardians/:guardianId?force=`

Unlink a guardian from a student.

- **`409`** if this is the student's primary guardian and other links exist
  — reassign primary first (message says so).
- **`400`** if this is the student's *only* guardian, unless `?force=true`.
- On success, if the guardian now has **zero** links across the whole
  school, the `Guardian` row itself is soft-deleted (`deletedAt`) — dead data
  otherwise, since nothing lists "unlinked guardians."

**Response `200`**: `{ id }` (the removed link's id).

### `PUT /students/:id/guardians/:guardianId/primary`

Makes `:guardianId` the student's primary guardian, atomically demoting the
current one. Concurrency-safe: the swap runs inside a transaction that locks
every guardian-link row for the student (`SELECT ... FOR UPDATE ... ORDER BY
id`) before deactivating the old primary and activating the new one — see
docs/DECISIONS.md for why the lock (and its row order) is load-bearing, not
decorative.

**Response `200`**: the now-primary link (`StudentGuardianSummary` shape).

**Response `404`**: the student, or `:guardianId` isn't currently linked to
it, or either is outside the caller's school.

### `PATCH /guardians/:id`

Edit a guardian's own fields (`firstName`/`lastName`/`phone`/`email`/
`address`) — tenant-scoped, independent of which student(s) it's linked to.
If the guardian is linked to more than one student (the sibling case), every
linked student's `GET /students/:id/guardians` reflects the change
immediately, since they all point at the same row.

**Response `404`**: outside the caller's school.

---

## Users — deprecated, superseded by Personnel (v0.2)

Added in step 8 (SPEC_V0.1.md §2 described this in step 4 but it was never
built then — see docs/DECISIONS.md). `SCHOOL_ADMIN` only; unlike Students,
`TEACHER` has no access at all here, not even read (`403`). Scoped to the
caller's school. Every mutation writes an `audit_logs` row.

**v0.2**: superseded by `/personnel` below, which additionally creates a
`staff_profile` (staff number, job title, ...) and recognizes `PROPRIETOR`.
`GET`/`POST`/`PATCH /users` are unchanged and still work exactly as before —
they are **not** extended to `PROPRIETOR` and deliberately do not create a
`staff_profile`, so prefer `/personnel` for any new integration.
`POST /users/:id/reset-password` is a true alias: it now delegates to the
same logic as `POST /personnel/:userId/reset-password` (and also accepts
`PROPRIETOR`), kept working for one version per SPEC_V0.2.md §2.

**All of `GET`/`POST`/`PATCH`/`reset-password /users`** are now marked
`@deprecated` (step 3 housekeeping, pre-approved) — behavior is unchanged,
this is a documentation-only marker. Planned removal: v0.3. Prefer
`/personnel` and `/teachers` for anything new.

### `GET /users?role=&search=&page=&pageSize=`

Paginated, ordered by `firstName`, tiebreak `id`. `role` filters to
`SCHOOL_ADMIN` or `TEACHER`. `search` is ILIKE against first name, last
name, or email. Soft-deleted users always excluded. Response items never
include `passwordHash`.

### `POST /users`

Body: `{ email, firstName, lastName, role }` — `role` must be
`SCHOOL_ADMIN` or `TEACHER` (`400` otherwise; `SUPER_ADMIN` accounts are
only provisioned via school creation). No password is supplied by the
caller — the server generates a temporary one.

**Response `201`**: `{ user, temporaryPassword }`. `temporaryPassword` is
returned once and never stored in retrievable form; there is no way to
fetch it again — use reset-password below if it's lost.

**Response `409`**: a user with this email already exists in this school.

### `PATCH /users/:id`

Body: any of `firstName`, `lastName`, `role` (`SCHOOL_ADMIN`/`TEACHER`
only), `status` (`ACTIVE`/`DISABLED`).

**Response `400`**: caller attempted to change their **own** `role`.

**Response `404`**: `:id` isn't a user in the caller's school.

### `POST /users/:id/reset-password`

Sets a new server-generated temporary password and revokes all of that
user's active refresh tokens (any other active session is logged out).

**Response `200`**: `{ temporaryPassword }` — shown once, same rule as
creation above.

---

## Dashboard

Added in step 8. `SCHOOL_ADMIN` and `TEACHER` both have read access, scoped
to the caller's school.

### `GET /dashboard/stats`

**Response `200`**
```json
{
  "totalActiveStudents": 25,
  "studentsByLevel": [{ "levelName": "JSS 1", "rank": 1, "count": 8 }],
  "currentSession": "2026/2027",
  "currentTerm": "FIRST"
}
```
`studentsByLevel` counts only students currently enrolled (current session)
and `ACTIVE`, grouped by class level, ordered by `rank`. Computed with one
grouped raw SQL query, not one query per level. If the school has no
current session yet, `studentsByLevel` is `[]` and `currentSession`/
`currentTerm` are `null` rather than erroring.

---

## Personnel (v0.2, SPEC_V0.2.md §2)

`PROPRIETOR`/`SCHOOL_ADMIN` only — unlike Students, there is no `TEACHER`
row at all here, not even read. Supersedes `/users` (see above). Every
mutation writes an `audit_logs` row.

### `GET /personnel?role=&jobTitle=&search=&page=&pageSize=`

Staff list — `staff_profiles` joined with `users`. `role` filters to
`PROPRIETOR`/`SCHOOL_ADMIN`/`TEACHER`; `jobTitle` to any `JobTitle` value.
`search` is ILIKE against first name, last name, or email. Paginated,
ordered by `firstName`, tiebreak `id`. Response items never include
`passwordHash`; the resource's own id is the **user's** id (field `id`),
with the staff profile row's id separately as `staffProfileId`.

### `POST /personnel`

Body: `{ email, firstName, lastName, role, jobTitle, phone?, qualification?, dateEmployed?, password }`.
`role` must be `PROPRIETOR`/`SCHOOL_ADMIN`/`TEACHER`. Unlike the old
`/users` (and unlike reset-password below), **the caller supplies the
password** — same shape as `POST /schools`'s admin sub-object — rather than
the server generating one. Creates the `user` + `staff_profile` in one
transaction; `staffNumber` is auto-generated as `{prefix}/STF/{4-digit
sequence}` (no year component, unlike admission numbers), serialized per
school by the same advisory-lock pattern.

**Response `409`**: a user with this email already exists in this school.

### `PATCH /personnel/:userId`

Body: any of `firstName`, `lastName`, `role`, `jobTitle`, `phone`,
`qualification`, `status`.

**Response `400`**: caller attempted to change their **own** `role`, or the
target is the school's last `PROPRIETOR`/`SCHOOL_ADMIN` and `role` would
change them to `TEACHER`.

**Response `404`**: `:userId` isn't a personnel record in the caller's school.

### `POST /personnel/:userId/reset-password`

Sets a new server-generated temporary password and revokes all of that
user's active refresh tokens. Works for any user in the tenant, not only
ones with a `staff_profile` (also reachable via the deprecated
`POST /users/:id/reset-password` alias).

**Response `200`**: `{ temporaryPassword }` — shown once, never retrievable again.

---

## Teachers (v0.2, SPEC_V0.2.md §2)

Read-shaped views over Personnel + assignments. `PROPRIETOR`/`SCHOOL_ADMIN`/`TEACHER`
all have read access (unlike Personnel above) — teachers can see their own
profile and assignments here.

### `GET /teachers?search=&page=&pageSize=`

Same shape as `GET /personnel`, filtered to `role: TEACHER`.

### `GET /teachers/:userId`

Profile plus current-session assignments: `classTeacherOf` (arms this
teacher is the class teacher of) and `subjectsTaught` (subject + arm
pairs, each carrying the assignment's own `id` — added in v0.2 step 5 so
the Teachers UI can target `DELETE /subject-assignments/:id` directly from
this list; see docs/DECISIONS.md). Three queries total regardless of data
size — no N+1 (SPEC_V0.2.md §5).

**Response `404`**: `:userId` isn't a `TEACHER` with a staff profile in the
caller's school.

---

## Subject assignments (v0.2, SPEC_V0.2.md §2)

`PROPRIETOR`/`SCHOOL_ADMIN` only.

### `POST /subject-assignments`

Body: `{ subjectId, classArmId, teacherUserId }` → the **current session**.
Immutable insert, not an upsert — unlike `PUT /class-arms/:id/class-teacher`,
a taken slot doesn't silently replace; the caller must `DELETE` then `POST`
to reassign.

**Response `404`**: `subjectId`, `classArmId`, or `teacherUserId` doesn't
resolve within the caller's school (the latter must also be a `TEACHER`
with a `staff_profile`).

**Response `409`**: the `(subject, arm, session)` slot is already taken —
message names the current holder, e.g. *"This subject is already assigned
to Bola Ogundare for this class."*

### `DELETE /subject-assignments/:id`

Removes the assignment. `404` if `:id` isn't in the caller's school
(including a repeat `DELETE`).

---

## Subjects (v0.2 step 3, SPEC_V0.2.md §2)

Manage: `PROPRIETOR`/`SCHOOL_ADMIN` only. View (`GET`): also `TEACHER`.

### `GET /subjects`

Paginated, ordered by `name`. Soft-deleted subjects always excluded. Each
row includes `classLevels` (ordered by `rank`) — added in v0.2 step 6 so
the Subjects tab can show them as chips without a per-subject GET (there
isn't one) or an N+1.

### `POST /subjects`

Body: `{ name, code? }`. `409` on a duplicate `name` within the school.

### `PATCH /subjects/:id`

Body: any of `name`, `code`.

### `DELETE /subjects/:id`

Soft delete (`deleted_at`).

**Response `409`**: the subject has at least one `subject_teacher_assignment`
(any session — a past assignment still counts as a real dependency).

### `PUT /subjects/:id/levels`

Body: `{ classLevelIds: [] }` — replaces the subject's `subject_class_levels`
set wholesale (delete-all-then-recreate in one transaction).

**Response `404`**: one or more `classLevelIds` don't belong to the caller's school.

**Response `200`**: the subject with its current `classLevels` (ordered by `rank`).

---

## Classes (v0.2 step 3, SPEC_V0.2.md §2)

Read-shaped views for the Classes tab. `PROPRIETOR`/`SCHOOL_ADMIN`/`TEACHER` can all read.

### `GET /classes`

Every class level with its arms, each carrying the **current session's**
enrollment count and class teacher (`null` if unassigned or if the school
has no current session — never an error). Computed as a single SQL
statement (a CTE resolving the current session, LEFT JOINed against
enrollments and class-teacher assignments, grouped) — query count doesn't
scale with the number of levels/arms/students (SPEC_V0.2.md §5).

**Response `200`**
```json
[
  { "id": "...", "name": "JSS 1", "rank": 1, "arms": [
    { "id": "...", "name": "A", "enrollmentCount": 25, "classTeacher": { "userId": "...", "firstName": "Bola", "lastName": "Ogundare" } }
  ] }
]
```

---

## Audit logs (v0.2 step 3, SPEC_V0.2.md §2)

`PROPRIETOR`/`SCHOOL_ADMIN` only. Pays the v0.1 debt (the student History
tab's placeholder note).

### `GET /audit-logs?entityType=&entityId=&page=&pageSize=`

Paginated, newest first (`createdAt` desc, tiebreak `id`). `entityType`/
`entityId` both optional and combinable — e.g. `entityType=student&entityId=...`
returns one student's full history (create, withdraw with its reason in
`metadata`, etc.).

**Response `200`**
```json
{
  "items": [{
    "id": "...", "action": "student.withdraw", "entityType": "student", "entityId": "...",
    "metadata": { "reason": "relocated" }, "createdAt": "...",
    "actor": { "id": "...", "firstName": "Adaobi", "lastName": "Nwachukwu" }
  }],
  "total": 1, "page": 1, "pageSize": 20
}
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
