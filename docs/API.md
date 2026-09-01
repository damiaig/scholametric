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
{ "identifier": "admin@sunrise.test", "password": "...", "schoolSlug": "sunrise" }
```
`identifier` (v0.6 step 2, SPEC_V0.6.md §2.2) is staff email OR a
`STUDENT`/`PARENT` portal username (`"OKAFOR1"`) — resolved against either
within the school `schoolSlug` scopes to. Unambiguous by construction: a
staff email always contains `@`; a provisioned username never does
(`family-coding.util.ts`). `schoolSlug` scopes the lookup (the same email
may exist at two schools; usernames are only unique per school too).

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
    "mustChangePassword": false,
    "schoolId": "...",
    "school": { "id": "...", "name": "Sunrise College", "slug": "sunrise" }
  }
}
```
`mustChangePassword` added in v0.3 (SPEC_V0.3.md §2) — see "Forced password
change" below. `email` is `null` for a `STUDENT`/`PARENT` portal account.

**Response `401`** — wrong password, wrong `schoolSlug`, unknown
identifier (email or username), a disabled/soft-deleted user, AND a
valid username+password submitted against a *different* school's
`schoolSlug` all return the exact same generic message (no distinguishing
responses, no timing side-channel — this is deliberate: a distinguishable
"wrong school" response would leak cross-tenant information, so a real
Sunrise username+password against Hillcrest's slug fails identically to
every other wrong combination, not with its own signal):
```json
{ "statusCode": 401, "message": "Invalid email/username, password, or school.", "error": "Unauthorized", ... }
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
  "mustChangePassword": false,
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

### `POST /auth/change-password` (v0.3, SPEC_V0.3.md §2)

Requires a valid access token. Any authenticated role.

**Body**: `{ "currentPassword": "...", "newPassword": "..." }` —
`newPassword` must be at least 8 characters.

Verifies `currentPassword`, sets `newPassword` (bcrypt cost 12), and clears
`mustChangePassword`. Audited (`user.changePassword`) with empty metadata —
deliberately not the standard `@Audit()`/`AuditInterceptor` path, which logs
`request.body` verbatim and would otherwise put both passwords in
`audit_logs`.

**Does NOT revoke the caller's other active sessions** — no
session/family concept exists in the schema to distinguish "this session"
from "others" (docs/DECISIONS.md). It DOES reissue a fresh token pair for
the caller (same shape as `POST /auth/refresh`), so their own client can
swap tokens and immediately stop being blocked by the guard below — without
this, the caller's own pre-existing access token would keep the stale
`mustChangePassword: true` claim until it naturally expired.

**Response `200`**: `{ accessToken, refreshToken }`.

**Response `401`**: `currentPassword` doesn't match.

**Response `400`**: `newPassword` under 8 characters.

### Forced password change (guard, v0.3)

`users.must_change_password` (set by personnel creation and password
reset — see Personnel below) is embedded as a claim in the access token
itself (`mustChangePassword`), read by a global `PasswordChangeRequiredGuard`
with **no extra DB query per request** — same stateless-token design as the
rest of `JwtAuthGuard`. Registered right after `JwtAuthGuard` in the guard
chain (before rate limiting/role checks), so a flagged user is blocked
regardless of role.

While the flag is true, every endpoint **except** `POST
/auth/change-password`, `GET /auth/me`, and `POST /auth/logout` returns
`403` using the unchanged standard error envelope, plus a response header:
```
X-Password-Change-Required: true
```
The frontend should key off `mustChangePassword` from login/`/auth/me`
directly (always fresh — that endpoint does its own DB read) rather than
waiting to hit this 403; the header is a defensive backstop for any request
made before the frontend has synced.

Because the claim is read from the JWT and not the DB, it can lag up to the
access token's remaining lifetime if some OTHER action flips it after the
token was issued (e.g. an admin resets a *different* user's password while
that user is mid-session) — accepted the same way `JwtAuthGuard` already
accepts staleness for disabled/deleted users.

v0.6 step 2: this guard is entirely role-agnostic and required zero
changes to cover `STUDENT`/`PARENT` portal accounts — provisioning (v0.6
step 1) always sets `mustChangePassword: true`, so the very first login
is hard-blocked from every route except the three exempted above,
exactly like a new staff account.

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

**Response `403`** (SPEC_V0.5.1.md §2.4, v0.5.1 step 2): a `TEACHER` who is
neither the class-teacher of this arm nor holds any subject assignment in
it this session — `"You are not assigned to this class."`, same rule and
same wording `GET /class-arms/:id/results` already used for this exact
situation. `SCHOOL_ADMIN`/`PROPRIETOR` unaffected, any arm in their school.

### `GET /class-arms/:id/results?termId=` (v0.4 step 5, SPEC_V0.4.md §2)

Grades overview — same role list as the plain `:id` GET above
(`PROPRIETOR`/`SCHOOL_ADMIN`/`TEACHER`), but `TEACHER` gets a
**row-filtered** response, computed by the same rule `GET
/students/:id/results` below uses: class-teacher of this arm+session sees
every subject and the `overall` column; a subject-only teacher sees just
their own subject(s) and `overall: null` (that column aggregates data
across subjects they don't teach). A teacher with no relationship to the
arm at all gets `403`.

```json
{
  "classArmId": "...", "termId": "...",
  "students": [{ "studentId": "...", "firstName": "...", "lastName": "...", "admissionNumber": "..." }],
  "subjects": [{
    "subjectId": "...", "subjectName": "Mathematics", "needsTeacherAssignment": false,
    "averageScore": 68.8, "averageGrade": "B3",
    "results": [{ "id": "...", "studentId": "...", "totalScore": 56, "autoGrade": "C5", "overrideGrade": null, "finalGrade": "C5", "subjectPosition": null, "status": "DRAFT" }]
  }],
  "overall": [{ "studentId": "...", "averageScore": 80, "averageGrade": "A1", "overallPosition": 1, "status": "PUBLISHED", "subjectsCount": 3 }]
}
```

`needsTeacherAssignment` (SPEC_V0.5.1.md §2.1, v0.5.1 step 1): `true` when
no `subject_teacher_assignment` currently exists for this (subject, class
arm, session) — a subject only ever appears here because it already has
real results, so it's never hidden for lacking one, only flagged. Same
field, same meaning, on `GET /grades/review` below and on
`GET /students/:id/results`/`GET /students/:id/report-card` (the report
card route predates this doc's Students section — see docs/DECISIONS.md).

`results[].id` is the `term_subject_result` id — lets an admin/owner
viewer target this exact row for `PUT /grades/override` without a second
lookup. `subjectPosition`/`overallPosition` are `null` until published
(same gate as everywhere else in `/grades/*`); a student with no row for
a subject at all just doesn't appear in that subject's `results` array
(the entry grid's "row absence = untouched" convention, one level up).
`overall` is `null` (not `[]`) specifically when the caller is a
subject-only `TEACHER` — distinct from "no one has any results yet" (an
empty array, which is what admin/owner/class-teacher get before any
`publish()`/`unpublish()` has ever run for this arm/term, since only
those two actions write `term_overall_results`).

Every read here is a fixed, small number of batched queries regardless of
roster size or subject count — one `findMany` for the whole class arm's
`term_subject_results` (grouped by subject in application code), one for
`term_overall_results`, one for the roster — never a query per subject or
per student.

**Response `403`**: a `TEACHER` with no class-teacher/subject-teacher
relationship to this arm+session at all. **Response `404`**: `id` (the
class arm) or `termId` don't resolve within the caller's tenant.

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
address }`. `404` outside the caller's school. **Note**: unlike `results`
below, this route has no `TEACHER`-scoping at all — any `TEACHER` can view
any student's basic profile (unchanged since v0.1, out of scope for v0.4).

### `GET /students/:id/results?termId=&sessionId=` (v0.4 step 5, SPEC_V0.4.md §2)

The Results tab — a student's results across subjects for one term.
`PROPRIETOR`/`SCHOOL_ADMIN` always allowed. `TEACHER` access is a plain
allow/deny, resolved via the student's enrollment for the given
`sessionId`: allowed if the caller is the class-teacher of that
enrollment's arm, or holds *any* subject assignment there (any subject —
not just the one being viewed); denied (`403`) otherwise. Deliberately
**looser** than `GET /class-arms/:id/results`'s per-subject row
filtering: this endpoint answers "do I know this student," not "which
subjects in this shared classroom screen are mine" — once a teacher is
confirmed to teach the student *something*, they see the student's full
results, every subject, same as flipping through a paper report card.

```json
{
  "studentId": "...", "termId": "...", "sessionId": "...",
  "subjects": [{
    "subjectId": "...", "subjectName": "Mathematics", "needsTeacherAssignment": false,
    "totalScore": 56, "autoGrade": "C5", "overrideGrade": null, "finalGrade": "C5",
    "classAverageScore": 33, "classAverageGrade": "F9",
    "subjectPosition": null, "status": "DRAFT"
  }],
  "overall": { "averageScore": 56, "averageGrade": "C5", "overallPosition": null, "status": "DRAFT", "subjectsCount": 1 }
}
```
(v0.7 step 1: a subject row's `status` is now only ever `"DRAFT"` or
`"PUBLISHED"` — see the Evaluations section below. `overall.status` can
still read `"PENDING_APPROVAL"`, a cross-subject aggregate over a mix of
`DRAFT`/`PUBLISHED` subjects, unrelated to the retired per-subject tier.)

`overall` is `null` specifically when the student has zero
`term_subject_results` this term (nothing entered at all) — distinct from
a real overall genuinely stuck at `DRAFT`. Unpublished subjects appear
with `status` set rather than being hidden ("not yet published" is a
staff-facing label, not an omission). `classAverageScore`/
`classAverageGrade` come from a single SQL-side `groupBy` `_avg` over just
this student's own subject ids — not a fetch of the whole class arm (that
full fetch is `GET /class-arms/:id/results`'s job) and not one query per
subject.

**Response `403`**: a `TEACHER` with no relationship to the student's
enrolled class arm for the given session. **Response `404`**: the
student, `termId`, or the student's enrollment for `sessionId` don't
resolve within the caller's tenant.

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

## Users — removed in v0.3

`GET`/`POST`/`PATCH /users` and `POST /users/:id/reset-password` existed
from step 8 of v0.1 through v0.2 (`SCHOOL_ADMIN` only), superseded by
`/personnel` in v0.2 and marked `@deprecated` with a planned v0.3 removal.
That removal happened in v0.3 step 1 (SPEC_V0.3.md §1) — the controller,
service, and DTOs are deleted entirely; all four routes now `404`. Use
`/personnel` (create/update/reset-password) and `/teachers` (read) for
everything this used to cover.

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

`totalActiveStudents` is scoped to the **current session** too (`ACTIVE`
students with an enrollment in `currentSession`) — not a school-wide count.
`0` right after activating a freshly-created, empty session is expected and
correct; that's exactly what the frontend's empty-session banner (v0.2 §4)
keys off of. If the school has no current session, this is `0`.

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

Sets a new server-generated temporary password, revokes all of that
user's active refresh tokens, and (v0.3) sets `mustChangePassword: true`
so they're forced through `POST /auth/change-password` on next login.
Works for any user in the tenant, not only ones with a `staff_profile`.
The v0.2 `POST /users/:id/reset-password` alias this used to also be
reachable through was removed in v0.3 (see "Users — removed in v0.3"
above).

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

### `GET /me/teaching` (v0.3, SPEC_V0.3.md §2)

The caller's **own** current-session teaching load — any authenticated
role (works for a PROPRIETOR/SCHOOL_ADMIN who also happens to hold a
class-teacher/subject-teacher assignment, not just `TEACHER`). A separate
endpoint from `GET /teachers/:userId` (not a param-less alias of it) —
reuses the same class-teacher/subject-teacher join shape, plus a
current-session enrollment count per class arm that `GET
/teachers/:userId` doesn't return (so that endpoint's response for admins
stays unchanged). Exempt from pagination (bounded by the caller's own
assignments — see CLAUDE.md §5 amendment, SPEC_V0.3.md §5).

**Response `200`**
```json
{
  "classTeacherOf": [
    { "classArmId": "...", "className": "JSS 1 A", "sessionId": "...", "sessionName": "2026/2027", "enrollmentCount": 42 }
  ],
  "subjects": [
    { "id": "...", "subjectId": "...", "subjectName": "Mathematics", "classArmId": "...", "className": "JSS 1 A" }
  ],
  "currentSessionId": "...",
  "currentTermId": "...",
  "currentTermName": "FIRST"
}
```
Both arrays are `[]`, not an error, for staff with no assignments.
`currentSessionId`/`currentTermId`/`currentTermName` (added v0.4 step 4)
are the school's current `isCurrent` session/term, `null` if none is set —
`TEACHER` has no other way to discover the current term (`GET /sessions`
and `GET /terms` are both admin-only), and the bulk score-entry grid's
picker needs it.

### `GET /me/profile` (v0.6 step 3, SPEC_V0.6.md §2.3)

`STUDENT` only. The caller's own basic profile — **not** the richer admin
`StudentDetail` shape (no guardians, no full history). `studentId` is
resolved server-side from `users.student_id` (the caller's own JWT
subject); there is no id param on this route at all.

```json
{
  "studentId": "...", "firstName": "Chidi", "lastName": "Okafor",
  "admissionNumber": "SUN/2026/0099", "gender": "MALE", "dateOfBirth": "2013-04-02",
  "status": "ACTIVE", "currentClassArmLabel": "JSS 1 A"
}
```
`currentClassArmLabel` is `null` if the student has no enrollment in the
current session.

### `GET /me/terms` (v0.6 step 3, SPEC_V0.6.md §2.3)

`STUDENT` only. The sessions/terms the caller was ever enrolled in (their
own `student_enrollments` rows only) — exists so a term picker has
something to read without broadening `GET /sessions`/`GET /terms`'s
admin-only `@Roles()` (the same reason `currentSessionId`/`currentTermId`
above exist for `TEACHER` instead of widening those endpoints).

```json
{
  "sessions": [
    {
      "id": "...", "name": "2026/2027", "isCurrent": true,
      "terms": [
        { "id": "...", "name": "FIRST", "isCurrent": true, "closedAt": null }
      ]
    }
  ]
}
```

### `GET /me/report-card?termId=&sessionId=` (v0.6 step 3, SPEC_V0.6.md §2.3)

`STUDENT` only. The caller's **own** report card — no `studentId` param
anywhere on this route; `MeService` resolves it from `users.student_id`
before calling the exact same `GradesService.getReportCard()` staff/
`TEACHER` callers use (`GET /students/:id/report-card` above), passing the
caller's own `AuthenticatedUser` through unchanged. That's what makes the
published-only filter below apply — not a fork, not a new "published"
concept.

Response shape is identical to `GET /students/:id/report-card`'s (same
type), with these differences baked into the query itself:
- `subjects` only ever includes `term_subject_results` with
  `status = PUBLISHED` — a `DRAFT`/`PENDING_APPROVAL` subject (including
  one with an absent-but-unpublished component) is **absent from the
  array entirely**, not a hidden field on a row that's there.
- `overall` is `null` unless `term_overall_results.status = PUBLISHED` —
  which `computeOverallStatus()` (`grade-computation.ts`) only reaches
  once **every** one of the student's subjects for the term is itself
  `PUBLISHED`. There is no partial/live ranking path; positions are
  always the ones `publish()`/`recompute()` already froze on the row.
- `remarks` (teacher/principal) are `null` unless `overall` is non-null —
  a remark shouldn't be visible ahead of the term's results actually
  being out.

Enrolled in the term with nothing published yet → **200**,
`{ "subjects": [], "overall": null, ... }` — a clean empty state, never an
error. Never enrolled in the term at all → the same `404` the staff
endpoint already returns (`"Student has no enrollment for this
session."`) — a different case ("not your term," not "nothing published
in your term").

**Response `400`**: any extra field in the query string (e.g. a smuggled
`studentId`) — the global `ValidationPipe`'s `forbidNonWhitelisted: true`
rejects it before the handler runs; `GetStudentResultsQueryDto` only ever
declared `termId`/`sessionId`, on this route or the staff one. **Response
`403`**: any role other than `STUDENT` — including `PARENT`: a parent has
no single "self" student, so this route isn't theirs; see `/me/children/*`
below.

### `GET /me/children` (v0.6 step 4, SPEC_V0.6.md §2.4)

`PARENT` only. The child-switcher's data — one entry (the same `MyProfile`
shape as `GET /me/profile`) per student **directly** linked to the
caller's own guardian record (`users.guardian_id`, resolved from the
token). This is the exact inverse of v0.6 step 1's `child_not_covered`
check: a family member grouped into the same household but never
directly linked to this guardian never appears here — not filtered out
after the fact, never fetched. A guardian linked to zero students returns
`{ "children": [] }`, not an error.

```json
{ "children": [ { "studentId": "...", "firstName": "Kemi", "lastName": "Okafor", "admissionNumber": "SUN/2026/0057", "gender": "FEMALE", "dateOfBirth": "2014-02-11", "status": "ACTIVE", "currentClassArmLabel": "JSS 1 A" } ] }
```

### `GET /me/children/:childId/profile` / `/terms` / `/report-card?termId=&sessionId=` (v0.6 step 4, SPEC_V0.6.md §2.4)

`PARENT` only. Same three shapes as the `STUDENT` routes above
(`MyProfile` / `MyAcademicContext` / `ReportCardResponse`), scoped to one
of the caller's **own** children instead of the caller themselves.

`childId` **is** a request field here — unlike the `STUDENT` routes, a
parent has more than one child, so there has to be one. Every handler
resolves the caller's allowed child-id set from `users.guardian_id` and
checks `childId` against it **before running any grade/profile query** —
not after, not as a defense-in-depth afterthought:

```ts
private async assertChildBelongsToCaller(userId: string, childId: string): Promise<void> {
  const childIds = await this.resolveOwnChildIds(userId);
  if (!childIds.includes(childId)) throw new NotFoundException("Student not found.");
}
```

**Response `404`**: `childId` doesn't resolve to one of the caller's own
directly-linked children — whether it's a garbage id, a real student in a
wholly different family, a `child_not_covered` family member, or a real
student in another school entirely, they all 404 **identically** through
this one allow-list check (no existence leak either way). The report-card
route then delegates to the exact same `GradesService.getReportCard()`
Step 3 uses (`publishedOnlyForSelfView` there already covers `PARENT`
alongside `STUDENT`) — same published-only filter, same remarks gate, not
a second copy of either.

A child directly linked to **two** guardians correctly appears under both
parents' `GET /me/children` — that's the intended blended-family case
(SPEC_V0.6.md §2.2b), not a leak.

**Response `403`**: any role other than `PARENT` — including `STUDENT`:
these routes take a `childId`, which means nothing for an account that
only ever reads its own single record via `/me/profile`/`/me/report-card`
above.

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

**`TEACHER` scoping** (SPEC_V0.5.1.md §2.4, v0.5.1 step 2): the SQL above
is unchanged and still runs for every role — `SCHOOL_ADMIN`/`PROPRIETOR`
get its result as-is. For `TEACHER`, the arm list is then filtered in
application code to arms they're the class-teacher of or hold a subject
assignment in this session (same relationship `GET /class-arms/:id`'s
`403` and grade-read access use — one shared helper, can't drift). Levels
left with zero visible arms after filtering are dropped, not returned
empty. A teacher with no assignments at all this session gets `[]`.

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

## Grade boundaries + grading presets (v0.3, SPEC_V0.3.md §2)

Score → grade mapping. `PUT` is `PROPRIETOR`/`SCHOOL_ADMIN` only; `GET
/grade-boundaries` additionally allows `TEACHER` (read-only — they'll
need this reference once score entry lands in v0.4, no reason to gate it
until then). All three endpoints exempt from pagination (CLAUDE.md §5
amendment) — bounded to 2-12 rows, or exactly 2 static tables for presets.

### `GET /grade-boundaries`

Ordered by `sortOrder`, tiebreak `id`.

### `PUT /grade-boundaries`

Body: `{ "boundaries": [{ "grade", "minScore", "maxScore", "remark",
"sortOrder" }, ...] }` — a named-property wrapper, not a bare array
(matches this API's existing array-body convention, e.g. `PUT
/subjects/:id/levels`'s `{ classLevelIds }` — see docs/DECISIONS.md).

Replaces the school's entire set atomically: validates 2-12 rows,
integer scores in 0-100, the full set **tiles 0-100 with no gaps or
overlaps** (starts at 0, ends at 100, each row's `minScore` is exactly
the previous row's `maxScore + 1` once sorted by score), and unique
grades, all in one transaction.

**Response `200`**: the new set, ordered by `sortOrder`.

**Response `400`**: a gap, an overlap, a duplicate grade, or a set that
doesn't start at 0 / end at 100 — message names the specific problem
(e.g. `"D7" (45-49) and "E8" (44-48) overlap.` or `There's a gap between
49 and 55.`).

Audited manually (`gradeBoundaries.replace`, `entityId` = the school's own
id — there's no single row's id to key off for a whole-set replace), not
via the standard `@Audit()`/`AuditInterceptor` (which reads `response.id`
off a single-entity response and would silently skip logging an array
response).

### `GET /grading-presets`

`PROPRIETOR`/`SCHOOL_ADMIN` only. Static, no DB — two apply-with-one-click
tables for the `PUT /grade-boundaries` UI to fill from:

```json
{
  "waec9Point": [
    { "grade": "A1", "minScore": 75, "maxScore": 100, "remark": "Excellent", "sortOrder": 1 },
    "... B2, B3, C4, C5, C6, D7, E8, F9 ...",
    { "grade": "F9", "minScore": 0, "maxScore": 39, "remark": "Fail", "sortOrder": 9 }
  ],
  "simpleAToF": [
    { "grade": "A", "minScore": 70, "maxScore": 100, "remark": "Excellent", "sortOrder": 1 },
    "... B, C, D ...",
    { "grade": "F", "minScore": 0, "maxScore": 44, "remark": "Fail", "sortOrder": 5 }
  ]
}
```
Both tile 0-100 with no gaps/overlaps, same as the rule the `PUT` enforces
on whatever a school actually saves. `simpleAToF`'s exact bands aren't
specified in SPEC_V0.3.md beyond "a simple A-F preset" — this 5-band
scheme was chosen for this step (docs/DECISIONS.md). Purely a local
lookup table — no external WAEC/NECO system, API, or result submission
involved (doesn't touch CLAUDE.md §9's "WAEC/NECO integration"
out-of-scope line).

---

## Evaluations — authoring & score entry (v0.7 steps 1-2, SPEC_V0.7.md §2/§3/§5)

v0.7 replaces v0.4's fixed CA1/CA2/Exam weighted-component model with
teacher-created **evaluations** — arbitrarily many per (class arm,
subject, term), each scored natively **out of 100** (no weights, no
per-evaluation `maxScore`). A subject's `term_subject_result.total_score`
is the plain average of every evaluation's decided score (a real score or
an explicit absence both count as "decided"; a never-touched evaluation
silently contributes nothing — never averaged in as a 0). There is no
`PENDING_APPROVAL` tier at the subject level any more: a row is `DRAFT`
until `POST /grades/publish` declares it final, full stop (docs/
DECISIONS.md). `term_overall_results.status` can still read
`PENDING_APPROVAL` — that's a **cross-subject** aggregate over a mix of
`DRAFT`/`PUBLISHED` subject rows, unrelated to the retired per-subject
tier.

Step 1 shipped the engine + score-entry endpoint; step 2 (below) adds
creating/editing/deleting an `Evaluation` itself, plus the authoring UI.

`TEACHER`: only their own `subject_teacher_assignments` (checked at the
session level — assignments carry no `term_id`; `termId` in these requests
is just which term's scores within that session-level assignment).
`SCHOOL_ADMIN`/`PROPRIETOR`: any class/subject in their school. `SUPER_ADMIN`
has no access (403, via `@Roles()` — it's absent from the list). Cross-tenant
ids (a `classArmId`/`subjectId`/`evaluationId`/`termId` belonging to another
school) always 404, checked before role/assignment — a cross-tenant probe
gets a uniform 404 regardless of caller role (CLAUDE.md §4).

### `GET /grades/evaluation-scores`

Query: `classArmId`, `subjectId`, `evaluationId`, `termId` (all required
UUIDs). Returns the entry grid for one class + subject + evaluation +
term: the class arm's current-session roster (excludes soft-deleted/
withdrawn students) each with their existing `raw_score` for this
evaluation (`null` if unentered). Unpaginated (CLAUDE.md §5 exception — a
class arm is bounded ~150, SPEC_V0.4.md §2 says return all rather than
paginate).

Each row also carries `status`: `"DRAFT" | "PENDING_APPROVAL" | "PUBLISHED"`
(the middle value is never actually set for a subject row any more, kept
only for shape stability), sourced from the student's `term_subject_results`
row for this subject/term (defaults to `"DRAFT"` if none exists yet). This
is **subject-level, not evaluation-level** — the same value repeats across
every evaluation's grid for a given student/subject/term, and can be
genuinely mixed within one response (e.g. one student published, another
still draft). Also carries the slice's term-lock state (SPEC_V0.5.md §2.3,
carried forward unchanged): `termClosed`, `locked`, `unlockReason`.

**Response `200`**
```json
{
  "classArmId": "...", "subjectId": "...", "evaluationId": "...", "termId": "...",
  "termClosed": false, "locked": false, "unlockReason": null,
  "rows": [
    { "studentId": "...", "firstName": "...", "lastName": "...", "admissionNumber": "SUN/2026/0001", "rawScore": 17, "isAbsent": false, "status": "DRAFT" }
  ]
}
```

**Response `403`**: `TEACHER` requesting a class/subject they aren't
personally assigned to (same tenant).

**Response `404`**: any of the four ids don't resolve within the caller's
own tenant, **or** (SPEC_V0.5.1.md §2.1/§2.2) no `subject_teacher_assignment`
exists at all for this (subject, class arm, session) — `SCHOOL_ADMIN`/
`PROPRIETOR` included. A subject only exists for a class once *some*
teacher is assigned to teach it there; until then it's "not gradeable,"
not "you lack permission," so this is `404`, deliberately different from
the `TEACHER` `403` above. Assign a teacher via `POST /subject-assignments`
to unlock entry.

### `PUT /grades/evaluation-scores`

Body: `{ classArmId, subjectId, evaluationId, termId, scores: [{ studentId, rawScore?, isAbsent? }] }`.
`rawScore` is nullable (clears a previously entered score) and validated
`0..100` at the DTO level (native — every evaluation is out of 100, no
per-row `maxScore` lookup needed). `rawScore` and `isAbsent: true` can
never both be set on the same score (400 at the DTO level; a DB `CHECK`
is the last-resort backstop). Every `studentId` must be in the resolved
roster.

Bulk upsert, **atomic per request**: every score and every `studentId` is
validated before anything is written; a single bad entry rejects the whole
batch with nothing persisted. **Idempotent**: re-sending an identical
payload is safe — `evaluation_scores`' existing `(evaluationId, studentId)`
unique is the upsert key. A `pg_advisory_xact_lock` keyed on
`(termId)` is acquired first (SPEC_V0.5.md §2.3 — shared with the exam
track below, since a closed term blocks editing either), then one keyed
on `(schoolId, subjectId, classArmId, termId)` serializes concurrent
saves to the same grid.

Recomputes each affected student's `term_subject_results` row at the end
of the same transaction — re-derived from **all** of that student's
current scores across every active evaluation for this subject/term, not
just the one this call wrote (`grades/grade-computation.ts`'s
`computeEvaluationAverage`): `total_score`, `auto_grade`, `final_grade`
(`override_grade` is preserved only for an admin/proprietor correction to
an already-published row — see the published-lock note below; cleared
otherwise). `status` is always `DRAFT` for a freshly recomputed row —
only `POST /grades/publish` ever sets `PUBLISHED`. Positions and
`term_overall_results` are untouched here (computed at publish time).

**Response `200`**: the touched rows only (not the whole roster — the
frontend already has the rest from `GET`), each with its saved `rawScore`/
`isAbsent` plus the freshly recomputed subject-result summary.
```json
{
  "classArmId": "...", "subjectId": "...", "evaluationId": "...", "termId": "...",
  "savedCount": 3,
  "rows": [
    { "studentId": "...", "rawScore": 14, "isAbsent": false, "totalScore": 14, "autoGrade": "F9", "finalGrade": "F9", "status": "DRAFT" }
  ]
}
```

**Response `400`**: a `rawScore` outside `0..100`, both `rawScore` and
`isAbsent: true` set on the same score, or a `studentId` not enrolled in
this class arm's current-session roster.

**Response `409`**: the term is closed for this class+subject with no
active unlock (`{ termLocked: true }` — SPEC_V0.5.md §2.3), **or** any
affected student's `term_subject_results` for this subject/term is
already `PUBLISHED` (`{ lockedStudentIds: [...] }`). `SCHOOL_ADMIN`/
`PROPRIETOR` may bypass the published-lock specifically to correct an
already-published score/absence (SPEC_V0.5.1.md §2.5) — `TEACHER` 409s
unconditionally either way. The closed-term lock has no such bypass; it
requires the principal's unlock flow (`POST /terms/:id/unlock`) first,
regardless of role.

**Response `403`/`404`**: same rules as `GET /grades/evaluation-scores` above.

Audited manually (`grades.saveEvaluationScores`, `entityId` = `classArmId`),
one row per bulk save, metadata includes `publishedBypassStudentIds` (empty
for an ordinary save, populated only for the admin/proprietor published-lock
bypass above, so that sensitive path stays traceable).

### `GET /grades/evaluations` / `POST /grades/evaluations` (v0.7 step 2, SPEC_V0.7.md §3)

The authoring surface — teacher-created evaluations. `TEACHER` (must hold
the `subject_teacher_assignment`)/`SCHOOL_ADMIN`/`PROPRIETOR` — same role
list as scoring (confirmed: an admin stepping in for a teacher may author
too). An `Evaluation` carries no status/publish field of its own; "is this
subject published" is read fresh off `term_subject_results` at the moment
of each authoring action, never cached, so it can't drift from the real
gate the scoring/publish endpoints already enforce.

**`GET`** — query: `classArmId`, `subjectId`, `termId`. Returns every
active (non-deleted) evaluation for that exact slice, oldest first, plus
the SAME lock-state fields `GET /grades/evaluation-scores` carries
(`termClosed`, `locked`, `unlockReason`) — so a "+ New evaluation"
affordance can show a blocked state up front, before the teacher opens the
form, not as a bare `409` after submitting.

```json
{
  "classArmId": "...", "subjectId": "...", "termId": "...",
  "termClosed": false, "locked": false, "unlockReason": null,
  "evaluations": [
    { "id": "...", "name": "CA 1", "description": "Fractions quiz", "createdAt": "...", "createdBy": "..." }
  ]
}
```

**`POST`** — body: `{ classArmId, subjectId, termId, name, description }`.
`name` (1-200 chars) and `description` (1-2000 chars) are both required
(SPEC_V0.7.md §3 — no optional description). classArmId/subjectId/termId
are fixed at creation — there is no "move this evaluation to another
term" operation.

- **`409` `{ termLocked: true }`**: the term is closed for this class+
  subject with no active unlock — same shared term lock the scoring
  endpoints use (closing a term blocks editing either track).
- **`409`**: this subject's results are already `PUBLISHED` for this term
  — the evaluation set is frozen once published (confirmed in step 1);
  unpublish first, then create.
- **`403`**: `TEACHER` not assigned to this subject/class.
- **`404`**: any id doesn't resolve within the caller's tenant, or no
  `subject_teacher_assignment` exists at all for this (subject, class arm,
  session) — same "hidden, not forbidden" rule as scoring.

**Response `200`/`201`**: the created/listed evaluation(s) — `{ id, name, description, createdAt, createdBy }`.

Audited (`evaluation.create`, standard `@Audit()`/`AuditInterceptor`).

### `PATCH /grades/evaluations/:id` (v0.7 step 2)

Body: `{ name?, description? }` — at least one required (`400` if both
omitted). Name/description only; re-scoping isn't in scope.

- Freely editable by `TEACHER` (assigned)/`SCHOOL_ADMIN`/`PROPRIETOR`
  while this subject's results are `DRAFT`.
- **`403`** once this subject has ANY `PUBLISHED` result: only
  `PROPRIETOR` may edit from that point — the same data-dependent
  role-narrowing shape `PUT /grades/override` already uses.
- Same term-lock `409` as create.
- No recompute — name/description never feed the average.

Audited (`evaluation.update`).

### `DELETE /grades/evaluations/:id` (v0.7 step 2)

`PROPRIETOR` only, categorical — enforced at the route (mirrors
`POST /grades/unpublish` exactly, not data-dependent).

- **`409`**: this subject's results are already `PUBLISHED` for this term.
  Blocks outright — confirmed no force-delete-through-published path.
  Unpublish first, then delete.
- Same term-lock `409` as create/edit.
- Otherwise: soft-deletes (`deleted_at`) and recomputes every affected
  student's `term_subject_result` for this class arm/subject/term — the
  deleted evaluation is automatically excluded from every future average/
  completeness check (every recompute already filters `deleted_at: null`,
  zero new branching). No cross-subject overall cascade runs here: because
  delete is blocked while anything's published, every affected row is
  guaranteed `DRAFT` at delete-time, so no student's overall could already
  be counting on this subject, and no first-ever-row case can arise
  (docs/DECISIONS.md — a future change allowing force-delete through a
  published state must add that cascade back).

**Response `200`**: `{ id }`. **Response `404`**: doesn't resolve within the caller's tenant.

Audited (`evaluation.remove`).

### `POST /grades/recompute`

`SCHOOL_ADMIN`/`PROPRIETOR` only (`TEACHER` 403s even on their own
assignment) — `200`, not the `POST` default `201`.

Body: `{ classArmId, subjectId, termId }` (no `evaluationId` — re-derives
`term_subject_results` for every student in the roster from whatever
`evaluation_scores` currently exist across all active evaluations, e.g.
after a roster fix). Same recompute path `PUT /grades/evaluation-scores`
triggers internally, just manually re-run; same `409` lock if any target
result is already `PUBLISHED`; not audited (a derived-state refresh, not
a source-of-truth write).

**Response `200`**: `{ "recomputedCount": 6 }`.

### `POST /grades/publish`

`SCHOOL_ADMIN` or `PROPRIETOR` (director-or-owner). `200`, not `201`.

Body: `{ classArmId, subjectId, termId }`. Transitions every currently
`DRAFT` `term_subject_results` row for that subject/class/term to
`PUBLISHED` (`published_at = now`), then computes `subject_position`
(standard competition ranking — ties share a rank, the next rank skips)
across the **entire** now-published set for that subject/class/term.
Re-publishing an already-fully-published subject is an idempotent `200`
(`publishedCount: 0`, positions reconfirmed). Then recomputes
`term_overall_results` for every student in the class arm/term.

Completeness gate (SPEC_V0.5.md §2.2, carried into v0.7): rejects (409)
if **any** candidate transitioning in this call has a blank evaluation —
no `evaluation_scores` row at all, or a row with neither `rawScore` nor
`isAbsent: true`. Checked over **every active `Evaluation` that currently
exists** for the subject/term at the moment of the call (not a frozen
expected-set from whenever the candidate started) — so a candidate can
become newly incomplete if a teacher adds a fresh evaluation before
publishing. Absent is a decided outcome, not blank.

**Response `200`**
```json
{
  "classArmId": "...", "subjectId": "...", "termId": "...",
  "publishedCount": 2,
  "subjectPositions": [
    { "studentId": "...", "totalScore": 80, "finalGrade": "A1", "subjectPosition": 1 }
  ],
  "overallPublishedCount": 1
}
```

**Response `409`**: nothing to publish (zero `DRAFT` rows and zero already
`PUBLISHED`), **or** the completeness gate above:
```json
{ "statusCode": 409, "message": "Cannot publish: 1 student(s) have at least one evaluation that's neither scored nor marked absent.", "error": "Conflict", "path": "...", "timestamp": "...", "incompleteEntries": [{ "studentId": "...", "evaluationId": "..." }] }
```

**Response `403`/`404`**: same rules as the rest of `/grades/*`.

Audited (`grades.publish`, `entityId` = `classArmId`, metadata carries
`subjectId`/`termId`/`publishedCount`).

### `POST /grades/unpublish`

`PROPRIETOR` only (owner authority — `SCHOOL_ADMIN` 403s here even though
it can publish). `200`, not `201`.

Body: `{ classArmId, subjectId, termId }`. Reverts every currently
`PUBLISHED` row for that subject/class/term — deterministically back to
`DRAFT` (no more `PENDING_APPROVAL` intermediate; score writes are blocked
while `PUBLISHED`, so nothing could have changed underneath), clearing
`subject_position`/`published_at`/`override_grade`. Then recomputes
`term_overall_results` for the whole class arm/term. This is the
confirmed path for adding a new evaluation to an already-published
subject: unpublish, add the evaluation, re-publish.

**Response `200`**: `{ classArmId, subjectId, termId, unpublishedCount, overallRevertedCount }`.

**Response `409`**: nothing is currently published for this subject.

**Response `403`/`404`**: same shape as publish.

Audited (`grades.unpublish`).

### `PUT /grades/override`

`SCHOOL_ADMIN` or `PROPRIETOR` may reach the route; whether the request
actually succeeds is data-dependent (checked inside the service, not by
`@Roles()`).

Body: `{ termSubjectResultId, overrideGrade }` — `overrideGrade` is
required but nullable (`null` clears an existing override; the key must
still be present — omitting it is a `400`). Sets `override_grade`;
`final_grade` is recomputed (`override_grade ?? auto_grade`). `total_score`
and `subject_position` are never touched.

- **`409`** if the result is currently `DRAFT`: override is only
  available once a result is **`PUBLISHED`** (v0.7: no more
  `PENDING_APPROVAL` intermediate to override against early). If a later
  unpublish reverts a `PUBLISHED` row back to `DRAFT`, the recompute nulls
  any stored override in the same write, not just leaves it stale.
- **`403`** if the result is `PUBLISHED` and the caller isn't `PROPRIETOR`
  — in effect, override is **`PROPRIETOR`-only** now (`SCHOOL_ADMIN` can
  never reach a state where override succeeds, since `DRAFT` 409s and
  `PUBLISHED` 403s for that role).
- **`400`** if `overrideGrade` isn't `null` and doesn't match one of the
  school's configured `grade_boundaries` grades.

**Response `200`**: the updated result — `{ id, studentId, subjectId, termId, overrideGrade, autoGrade, finalGrade, status }`.

**Response `404`**: `termSubjectResultId` doesn't resolve within the
caller's own tenant.

Audited (`grades.override`, `entityId` = `termSubjectResultId`, metadata
records `studentId`/`subjectId`/`classArmId`/`termId` plus
`oldOverrideGrade`/`newOverrideGrade`).

### Locking (publish/unpublish/override, alongside `PUT /grades/evaluation-scores`)

All four acquire the same per-subject `pg_advisory_xact_lock` keyed on
`(school_id, subject_id, class_arm_id, term_id)` before touching
`term_subject_results`/`evaluation_scores` for that grid. Publish and
unpublish additionally acquire a **second, broader** lock — keyed on
`(school_id, class_arm_id, term_id)`, no `subject_id` — before recomputing
`term_overall_results`. Both locks are always acquired in the same order
(subject-lock, then class-arm-lock) — a fixed global lock order, so no
caller can deadlock against another. The term-level lock (SPEC_V0.5.md
§2.3) is **shared with the exam track** below — closing a term blocks
editing either track; the two tracks' subject/class-arm locks use
distinct key namespaces (`grades:...` vs `exams:...`) so they never
contend with each other.

### `GET /grades/review?classArmId=&termId=&status=` (v0.4 step 5, SPEC_V0.4.md §2)

Director/owner publish-readiness view — `SCHOOL_ADMIN`/`PROPRIETOR` only,
no `TEACHER` path exists on this route at all. One row per subject that
has at least one `term_subject_result` in this class arm/term.

A subject's state is returned as **counts**, not one status:
`saveEvaluationScores`'s per-student `PUBLISHED` lock means stragglers can
land in `DRAFT` after their classmates are already `PUBLISHED` for the
very same subject, so draft/published can genuinely coexist for one
subject. `pendingApprovalCount` is always `0` now (kept for shape
stability only — no subject row can reach that status any more).

```json
{
  "classArmId": "...", "termId": "...",
  "subjects": [
    {
      "subjectId": "...", "subjectName": "Mathematics", "needsTeacherAssignment": false,
      "rosterSize": 20, "draftCount": 7, "pendingApprovalCount": 0, "publishedCount": 13,
      "averageScore": 68.8, "averageGrade": "B3",
      "canPublish": true
    }
  ]
}
```

`averageScore`/`averageGrade` cover every student with a row (draft too,
not published-only). `canPublish` mirrors `POST /grades/publish`'s own
condition: `(draftCount > 0 && every DRAFT candidate is complete) ||
publishedCount > 0` — so the UI can disable the Publish button instead of
offering an action that will just `409`.

The optional `status=` query filters to subjects with **at least one**
student in that status.

**Response `403`**: any `TEACHER`. **Response `404`**: `classArmId`/`termId`
don't resolve within the caller's tenant.

---

## Exams — authoring, score entry, publish & the two exam views (v0.7 steps 1-3, SPEC_V0.7.md §2/§3/§4/§5)

Track B: exams are a **separate track** from evaluations above, scored
against `Exam`/`exam_scores` (native /100, same absence semantics) and
published into their own `term_subject_exam_results` — they **never**
contribute to `term_subject_results`/`term_overall_results`. Role rules,
lock ordering, completeness-gate shape, and audit-log discipline all
mirror the evaluation track above exactly ("same publish model as v0.4,"
confirmed) — only the target tables differ. `term_subject_exam_results`
has neither `subjectPosition` nor `overrideGrade` (Q6: exams rank only at
the per-term/whole-year levels below, never per-subject).

Step 1 shipped the engine + score-entry/publish endpoints; step 3 (below)
adds creating/editing/deleting an `Exam` itself, plus the two read views
(`GET .../exams` and `GET .../year-exams`) that surface what the engine
computes. There is still no `GET /exams/review` — publishing from the UI
is a minimal action on the scoring page, not a second review-list surface
(confirmed, out of scope this step).

### `GET` / `PUT /exams/scores`

Same shape as `GET`/`PUT /grades/evaluation-scores`, with `examId` in
place of `evaluationId`. Term-lock is the **same shared lock** the
evaluation track uses (closing a term blocks both); the subject/class-arm
locks use the `exams:...` namespace, distinct from `grades:...`, so the
two tracks never contend with each other.

### `POST /exams/recompute`

Same shape as `POST /grades/recompute`, retargeted to the exam track.

### `POST /exams/publish`

Same shape/gate as `POST /grades/publish`, but the response carries no
`subjectPositions` (none exist at this level). Cascades upward through
**two** more aggregates, both purely derived (no separate publish action
of their own):

- **`term_exam_results`** (Q6 ranking (b)) — per student+term, the
  average across every subject they've been exam-scored in this term.
  `examPosition` ranks only students whose exam track is **fully
  published** across every subject they have a row for this term (same
  all-or-nothing rule as the evaluation track's overall).
- **`year_exam_results`** (Q6 ranking (c)) — per student+session, the
  average across every term's `term_exam_results` that's currently
  `PUBLISHED` this session. Recomputed progressively as each term
  publishes — a student's row doesn't exist at all until they have at
  least one published term this session; `yearExamPosition` ranks only
  among students who do.

**Response `200`**: `{ classArmId, subjectId, termId, publishedCount, termExamPublishedCount, yearExamRecomputedCount }`.

### `POST /exams/unpublish`

`PROPRIETOR` only, same shape as `POST /grades/unpublish` — reverts to
`DRAFT` and cascades the same two aggregates above (a student dropping
out of a fully-published term also drops out of that term's ranking, and
the year-level average recomputes without their now-unpublished term).

**Response `200`**: `{ classArmId, subjectId, termId, unpublishedCount, termExamRevertedCount, yearExamRecomputedCount }`.

### `GET /exams` / `POST /exams` (v0.7 step 3, SPEC_V0.7.md §3)

The authoring surface — mirrors `GET`/`POST /grades/evaluations` exactly,
with one shape difference: an `Exam` has only a `name`, and it's
**optional** (`1-200` chars if given). A caller who omits it gets `"Exam"`
back as the display name — resolved once, server-side
(`ExamsService.toExamResponse`), so no consumer ever handles `null`.

**`GET`** — query: `classArmId`, `subjectId`, `termId`. Same lock-state
fields as the evaluation list (`termClosed`, `locked`, `unlockReason`).

```json
{
  "classArmId": "...", "subjectId": "...", "termId": "...",
  "termClosed": false, "locked": false, "unlockReason": null,
  "exams": [
    { "id": "...", "name": "Exam", "createdAt": "...", "createdBy": "..." }
  ]
}
```

**`POST`** — body: `{ classArmId, subjectId, termId, name? }`.
classArmId/subjectId/termId fixed at creation, same as evaluations.

- **`409` `{ termLocked: true }`**: shared term lock, same as evaluations.
- **`409`**: this subject's exam results are already `PUBLISHED` for this
  term — the exam set is frozen once published (confirmed, mirrors the
  evaluation rule exactly) — unpublish first, then create.
- **`403`**/**`404`**: same `TEACHER` assignment / tenant / "no assignment
  at all" rules as the evaluation authoring routes.

**Response `200`/`201`**: `{ id, name, createdAt, createdBy }`.

Audited (`exam.create`, standard `@Audit()`).

### `PATCH /exams/:id` (v0.7 step 3)

Body: `{ name? }` — required (`400` if omitted; the only field there is).

- Freely editable while this subject's exam results are `DRAFT`.
- **`403`** once ANY row is `PUBLISHED` for this subject/term: `PROPRIETOR`
  only from that point — same data-dependent narrowing as evaluations.
- Same term-lock `409` as create.

Audited (`exam.update`).

### `DELETE /exams/:id` (v0.7 step 3)

`PROPRIETOR` only (categorical — no `TEACHER`/`SCHOOL_ADMIN` path exists
at all, regardless of state). Soft-deletes (`deletedAt`) and recomputes
the roster's `term_subject_exam_results` for this subject/term.

- **`409`**: this subject's exam results are already `PUBLISHED` — no
  force-delete-through-published path. This is why the recompute needs no
  cascade to `term_exam_results`/`year_exam_results`: every affected row
  is guaranteed `DRAFT` at delete-time (docs/DECISIONS.md).
- **`409` `{ termLocked: true }`**: same shared term lock.

**Response `200`**: `{ id }`.

Audited (`exam.remove`).

### `GET /students/:id/exams` / `GET /me/exams` / `GET /me/children/:childId/exams` (v0.7 step 3, SPEC_V0.7.md §4)

The per-term "Show exams" button — one subject's exam breakdown for one
student in one term. Query: `subjectId`, `termId`, `sessionId`. Same
security resolution as `GET /students/:id/report-card` (student ->
enrollment -> `resolveTeacherAccess` for `TEACHER` -> published-only for
`STUDENT`/`PARENT`), just scoped to a single subject instead of the whole
card. The self/child routes resolve `studentId` from the token/linked-
children set exactly like the report-card routes do — never a request
field.

**The published-only wall (the safety-critical part):** for `STUDENT`/
`PARENT`, a subject is visible only if its `term_subject_exam_result` row
is `PUBLISHED`. If it's `DRAFT` (or doesn't exist yet), the response is
**indistinguishable from "nothing entered yet"** — `exams: []`, both
averages `null`, `status: null` — never a hint that draft data exists.
Staff (`TEACHER`/`SCHOOL_ADMIN`/`PROPRIETOR`) always sees the real state.

```json
{
  "studentId": "...", "subjectId": "...", "subjectName": "Mathematics",
  "termId": "...", "sessionId": "...",
  "exams": [
    { "examId": "...", "name": "Exam", "rawScore": 78, "isAbsent": false }
  ],
  "subjectExamAverage": 78, "subjectExamGrade": "B2", "status": "PUBLISHED"
}
```

**Response `404`**: student/subject/term don't resolve in-tenant, or the
student has no enrollment for `sessionId`. **`403`**: `TEACHER` with no
relationship to this student's class arm.

### `GET /students/:id/year-exams` / `GET /me/year-exams` / `GET /me/children/:childId/year-exams` (v0.7 step 3, SPEC_V0.7.md §4)

The dedicated year-long Exams view. Query: `sessionId`. Returns every term
in that session (chronological), each with every subject's individual
exams + that subject's average, the term's cross-subject average/grade/
position (`term_exam_results`), and the whole-session overall at the end
(`year_exam_results`).

**Visibility is independently gated at every level**, mirroring
`GET /students/:id/report-card`'s per-subject filtering exactly — a
subject's own row, its term's cross-subject aggregate, and the
whole-session aggregate each check **their own** `status`. Concretely:
publishing is a per-subject action, so a student's Mathematics exam can be
published before the rest of that term's subjects are — the subject
shows immediately, without waiting for the term-level average to catch
up. This is also what makes a **partially-published year** fall out for
free: a term with no published aggregate yet still shows whichever of its
subjects individually published; a term with zero published anything
shows `subjects: []` and every aggregate `null` — never an error, never a
gap in the array (every term the student was enrolled in this session
gets an entry, empty or not).

```json
{
  "studentId": "...", "sessionId": "...",
  "terms": [
    {
      "termId": "...", "termName": "FIRST",
      "subjects": [
        { "subjectId": "...", "subjectName": "Mathematics", "exams": [...], "subjectExamAverage": 78, "subjectExamGrade": "B2" }
      ],
      "termExamAverage": 74, "termExamGrade": "B3", "termExamPosition": 2, "status": "PUBLISHED"
    },
    { "termId": "...", "termName": "SECOND", "subjects": [], "termExamAverage": null, "termExamGrade": null, "termExamPosition": null, "status": null }
  ],
  "overallExamAverage": null, "overallExamGrade": null, "yearExamPosition": null, "termsCount": 0, "overallStatus": null
}
```

**Response `404`**: student doesn't resolve in-tenant, or no enrollment
for `sessionId`. **`403`**: `TEACHER` with no relationship to this
student's class arm.

---

## Portal accounts (v0.6 step 1, SPEC_V0.6.md §5)

`PROPRIETOR`/`SCHOOL_ADMIN` only — provisions `STUDENT`/`PARENT` portal
login accounts from existing `Student`/`Guardian` records; creates nothing
new about a student or guardian, only links a `User` row to one. No login
path exists for these accounts yet (v0.6 step 2).

### `POST /portal-accounts/provision`

No body — school-scoped from the JWT. Idempotent and re-runnable: creates
accounts only for students/families that don't already have one, and
never renumbers an already-issued username. `200`, not `201` (an idempotent
bulk action, same convention as `POST /grades/recompute`).

Groups students into **families** by existing guardian links (any
`student_guardians` row, not surname text) — connected components, so
linked siblings with different surnames are one family, and unrelated
students who happen to share a surname are never merged. Each family gets
one school-unique **family code** (the anchor guardian's surname stem,
escalating a trailing letter — `OKAFOR`, `OKAFORB`, ... — on collision);
the guardian's account is the bare code, each child's is the code plus a
per-family digit (`OKAFOR1`, `OKAFOR2`, ...), always in that digit
allocation's own family (never swept in from a letter-escalated
neighbor). Numeric temp passwords are returned **once**, in this
response, hashed at rest immediately — there is no way to retrieve a
temp password after this call returns; a lost/unprinted slip is a
**reset-and-reissue** (v0.6 step 5), not a re-fetch.

```json
{
  "studentsCreated": [{ "id": "...", "username": "OKAFOR1", "tempPassword": "483920", "studentId": "..." }],
  "parentsCreated": [{ "id": "...", "username": "OKAFOR", "tempPassword": "719204", "guardianId": "..." }],
  "alreadyProvisioned": { "students": 12, "parents": 5 },
  "warnings": [
    { "type": "no_guardian", "studentId": "...", "message": "..." },
    { "type": "no_primary_guardian_marked", "studentId": "...", "guardianId": "...", "message": "..." },
    { "type": "child_not_covered", "studentId": "...", "familyCode": "OKAFOR", "message": "..." }
  ]
}
```

`warnings` never blocks provisioning — a family missing a guardian, or a
student not directly linked to its family's anchor guardian, still gets
the account(s) it can; the gap is surfaced, not silently dropped or
leaked. `child_not_covered` is the one a parent's future read-scope
(v0.6 step 4) depends on: that scope is the anchor guardian's **own**
direct links, never "family membership", so a flagged child is guaranteed
invisible to that parent login — this warning is purely for admin
visibility/cleanup.

**Response `403`**: any role other than `PROPRIETOR`/`SCHOOL_ADMIN`.

### `GET /portal-accounts?page=&pageSize=`

Paginated list of provisioned accounts (`role`, `username`, `displayName`
— read live through the linked `Student`/`Guardian`, same convention as
`class-arms`' `teacherFirstName`, not a copy). `403` for `TEACHER`.

### `GET /portal-accounts/:id`

Single account. **Response `404`**: unknown id, or an id from another
school (cross-tenant, never a `403` — CLAUDE.md §4).

### `POST /portal-accounts/:id/reissue` (v0.6 step 5, SPEC_V0.6.md §5)

No body. Generates a **fresh** numeric temp password for one already-
provisioned account (same generator/bcrypt cost as `provision()` above —
no parallel implementation), re-arms `mustChangePassword`, and revokes
every active refresh token for the account (same shape as `POST
/personnel/:userId/reset-password`) — the old password and any live
session die immediately, not just on next login. The plaintext is
returned **once**, in this response only.

```json
{
  "id": "...",
  "role": "STUDENT",
  "username": "OKAFOR1",
  "displayName": "...",
  "studentId": "...",
  "guardianId": null,
  "mustChangePassword": true,
  "createdAt": "...",
  "tempPassword": "205917"
}
```

Audited (`@Audit("portalAccount", "reissue")`) — the request carries no
body, so `audit_logs.metadata` is empty; the response's `tempPassword`
never reaches the audit trail (`AuditInterceptor` only ever reads
`response.id` and logs `request.body`).

**Response `403`**: any role other than `PROPRIETOR`/`SCHOOL_ADMIN`.
**Response `404`**: unknown id, or cross-tenant.

### `POST /portal-accounts/class-arms/:classArmId/reissue` (v0.6 step 5)

Body: `{ "force"?: boolean }` (default `false`). Batch reissue for a class
arm's **current-session roster**: every roster student's own `STUDENT`
account, plus the deduplicated set of `PARENT` accounts directly linked
(`student_guardians`) to any of those students — a guardian shared across
two roster siblings is reissued once, not twice. Unaudited (bulk action,
same convention as `provision()`).

By default, an account that already changed its password
(`mustChangePassword: false` — a family actively using their login) is
**skipped, not reset**, and reported with a reason; `force: true` resets
those too. A roster student with no portal account at all is always
skipped as `not_provisioned`, regardless of `force`. Neither skip
category is ever silently dropped.

```json
{
  "classArmId": "...",
  "reissued": [{ "id": "...", "role": "STUDENT", "username": "...", "tempPassword": "...", "...": "..." }],
  "skipped": [
    { "id": "...", "username": "OKAFOR", "displayName": "...", "reason": "already_changed_password" },
    { "id": "...", "username": null, "displayName": "...", "reason": "not_provisioned" }
  ]
}
```

**Important**: reprinting a class's slips with `force: true` invalidates
the current password for every already-logged-in family included — a
real, deliberate reset, not a side effect to run casually (see
docs/DECISIONS.md).

**Response `403`**: any role other than `PROPRIETOR`/`SCHOOL_ADMIN`.
**Response `404`**: unknown `classArmId`, or cross-tenant.

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
