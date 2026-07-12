# ScholaMetric — SPEC v0.1 "Foundation"

Goal: a running multi-tenant skeleton where a school admin can log in and
manage students. Everything later (grades, attendance, homework) hangs off
the entities built here, so this version is small but exact.

Delivered when: `docker-compose up` boots Postgres + Redis + API + Web;
the seed script creates one demo school with an admin; that admin can log
in on the web app, create classes, and admit/edit/search/deactivate
students — with all acceptance criteria in §7 passing.

---

## 1. Domain model (v0.1 tables only)

Nigerian school structure assumed: a school runs **sessions** (e.g.
"2026/2027") of **three terms**; students belong to a **class arm**
(e.g. "JSS 2B") within a session. Grading uses this in v0.4; v0.1 only
needs the containers.

### schools
| column        | type         | notes                                   |
|---------------|--------------|-----------------------------------------|
| id            | uuid PK      |                                         |
| name          | text         | required, e.g. "Sunrise College, Abuja" |
| slug          | text         | UNIQUE, url-safe, immutable             |
| type          | enum         | NURSERY_PRIMARY, SECONDARY, COMBINED    |
| address       | text         | nullable                                |
| phone         | text         | nullable, E.164                         |
| email         | text         | nullable                                |
| status        | enum         | ACTIVE, SUSPENDED (default ACTIVE)      |
| created_at / updated_at | timestamptz |                              |

### users
| column        | type    | notes                                        |
|---------------|---------|----------------------------------------------|
| id            | uuid PK |                                              |
| school_id     | uuid FK | NOT NULL, indexed. SUPER_ADMIN rows use a    |
|               |         | reserved "platform" school row for now.      |
| email         | citext  | UNIQUE(school_id, email)                     |
| password_hash | text    | bcrypt cost 12                               |
| first_name    | text    |                                              |
| last_name     | text    |                                              |
| role          | enum    | SUPER_ADMIN, SCHOOL_ADMIN, TEACHER, PARENT, STUDENT |
| status        | enum    | ACTIVE, DISABLED (default ACTIVE)            |
| last_login_at | timestamptz | nullable                                 |
| deleted_at    | timestamptz | nullable (soft delete)                   |
| created_at / updated_at |   |                                          |

### refresh_tokens
id (uuid PK), user_id (FK, indexed), token_hash (text), expires_at,
revoked_at (nullable), created_at. Rotated on every refresh; reuse of a
revoked token revokes the whole family for that user.

### academic_sessions
id, school_id (FK, NOT NULL), name (e.g. "2026/2027"),
starts_on (date), ends_on (date), is_current (bool),
UNIQUE(school_id, name). Exactly one `is_current = true` per school,
enforced by a partial unique index.

### terms
id, school_id, session_id (FK), name enum (FIRST, SECOND, THIRD),
starts_on, ends_on, is_current (bool), UNIQUE(session_id, name).

### class_levels
Static-ish per school: id, school_id, name (e.g. "JSS 1", "SSS 3",
"Primary 4"), rank (int, for ordering/promotion later),
UNIQUE(school_id, name).

### class_arms
id, school_id, class_level_id (FK), name (e.g. "A", "B", "Gold"),
UNIQUE(class_level_id, name). Display name is computed: "JSS 1 A".

### students
| column            | type    | notes                                    |
|-------------------|---------|------------------------------------------|
| id                | uuid PK |                                          |
| school_id         | uuid FK | NOT NULL, indexed                        |
| admission_number  | text    | UNIQUE(school_id, admission_number)      |
| first_name        | text    | required                                 |
| last_name         | text    | required                                 |
| middle_name       | text    | nullable                                 |
| gender            | enum    | MALE, FEMALE                             |
| date_of_birth     | date    | required, must be in the past            |
| admitted_on       | date    | default today                            |
| status            | enum    | ACTIVE, SUSPENDED, GRADUATED, TRANSFERRED, WITHDRAWN (v0.1 uses ACTIVE/WITHDRAWN) |
| guardian_name     | text    | required (proper parent accounts = v0.7) |
| guardian_phone    | text    | required                                 |
| guardian_email    | text    | nullable                                 |
| address           | text    | nullable                                 |
| deleted_at        | timestamptz | nullable                             |
| created_at / updated_at |   |                                          |

### student_enrollments
Links a student to a class arm for a session (history-preserving —
promotion in v0.9 just adds a new row):
id, school_id, student_id (FK), class_arm_id (FK), session_id (FK),
enrolled_on (date), UNIQUE(student_id, session_id).
Indexes: (school_id, class_arm_id, session_id), (student_id).

### audit_logs (minimal now, grows later)
id, school_id, actor_user_id, action (text, e.g. "student.create"),
entity_type, entity_id, metadata (jsonb), created_at.
Written automatically by an interceptor for every successful mutation.

Admission number generation: `{school prefix from slug, uppercased}/{session
start year}/{4-digit sequence per school}` e.g. `SUN/2026/0041`. Generated
server-side inside the same transaction as student creation; user may
override with a custom value if unique.

---

## 2. API endpoints (all under /api/v1)

Auth
- `POST /auth/login` — { email, password, schoolSlug } → { accessToken,
  refreshToken, user }. schoolSlug scopes the email lookup (same email may
  exist at two schools).
- `POST /auth/refresh` — { refreshToken } → new pair (rotation).
- `POST /auth/logout` — revokes the presented refresh token.
- `GET /auth/me` — current user profile + school summary.

Schools (SUPER_ADMIN only)
- `POST /schools` — creates school + its first SCHOOL_ADMIN user in one
  transaction: { name, slug, type, admin: { email, firstName, lastName,
  password } }.
- `GET /schools`, `GET /schools/:id`, `PATCH /schools/:id`

School setup (SCHOOL_ADMIN)
- `GET/POST /sessions`, `PATCH /sessions/:id`, `POST /sessions/:id/activate`
  (sets is_current, deactivates others, in one transaction)
- `GET/POST /terms` (scoped to a session), `POST /terms/:id/activate`
- `GET/POST/PATCH /class-levels`
- `GET/POST/PATCH /class-arms`

Users (SCHOOL_ADMIN)
- `GET /users?role=&search=&page=` — list school staff
- `POST /users` — create TEACHER or additional SCHOOL_ADMIN
- `PATCH /users/:id` — name, role (cannot demote self), status
- `POST /users/:id/reset-password` — sets a temporary password, returns it
  once (email delivery is a later version)

Students (SCHOOL_ADMIN; TEACHER read-only)
- `POST /students` — bio data + { classArmId } → creates student +
  enrollment in current session, one transaction.
- `GET /students?search=&classArmId=&status=&page=&pageSize=` — search
  matches name (ILIKE, trigram index) and admission number.
- `GET /students/:id` — full profile + current enrollment.
- `PATCH /students/:id` — bio/guardian fields.
- `POST /students/:id/withdraw` — { reason } → status WITHDRAWN, audit log.
- `POST /students/:id/transfer-class` — { classArmId } → updates current
  session enrollment (v0.1 allows correction; formal promotion is v0.9).

Misc
- `GET /health` — { status: "ok", db: true, redis: true } (public).
- `GET /schools/search?q=` — PUBLIC (@Public()). Returns up to 10 ACTIVE
  schools matching the query: { id, name, slug } only — no address, no
  contact details, no counts. Matches on name (ILIKE) and slug. Empty or
  1-character queries return an empty list (no full-directory dump).
  Rate limited: 30 req/min per IP. Used by the login page school picker.
  Built in step 3; consumed in step 6.

RBAC matrix (v0.1):

| Action                    | SUPER_ADMIN | SCHOOL_ADMIN | TEACHER |
|---------------------------|:-----------:|:------------:|:-------:|
| Manage schools            | ✔           |              |         |
| Manage sessions/terms     |             | ✔            |         |
| Manage classes            |             | ✔            |         |
| Manage users              |             | ✔            |         |
| Create/edit students      |             | ✔            |         |
| View/search students      |             | ✔            | ✔       |

---

## 3. Seed script (`pnpm seed`)

Creates: platform school + SUPER_ADMIN (super@scholametric.test /
Passw0rd!); demo school "Sunrise College" (slug `sunrise`) with one
SCHOOL_ADMIN (admin@sunrise.test), one TEACHER, session 2026/2027 with
three terms (first term current), class levels JSS 1–SSS 3 with arms A/B,
and 25 realistic Nigerian students distributed across arms. Idempotent —
safe to run twice.

---

## 4. Web app pages (v0.1)

Layout: left sidebar (school name, nav, user menu) + top bar with global
student search. Sidebar collapses to a bottom sheet on mobile.

1. `/login` — school picker + email + password. The school field is
   a button ("Select your school"); clicking it opens a modal with a
   search bar (autofocused). Typing (debounced 300ms, min 2 chars)
   queries GET /schools/search and shows matching schools; selecting
   one closes the modal and shows the school name on the button. The
   chosen slug is sent with login. States: searching spinner, "no
   schools found" empty state, error state. Modal is keyboard-
   navigable (arrows + Enter) and works at 360px. Friendly login
   errors; no distinction between "wrong email" and "wrong password".
2. `/dashboard` — stat cards (total active students, students by level as
   a bar chart via recharts, current session/term banner). Real data, no
   placeholders.
3. `/students` — DataTable: photo placeholder initials, name, admission
   no. (JetBrains Mono), class, gender, status badge, actions. Server-side
   pagination + debounced search + class filter. Row click → detail.
4. `/students/new` — multi-section form (Bio → Guardian → Class), Zod
   validation, DOB picker capped at today, duplicate admission-number
   error surfaced inline.
5. `/students/:id` — profile header (name, admission no., status badge,
   class), tabs: Overview (bio + guardian), History (enrollments + audit
   trail), actions: Edit, Transfer class, Withdraw (confirm dialog typing
   the student's surname).
6. `/settings/school` — school profile; `/settings/academic` — sessions,
   terms, class levels/arms management; `/settings/users` — staff table +
   create/edit drawer.
7. Route guards: unauthenticated → /login; TEACHER role sees students
   read-only (no New/Edit/Withdraw buttons rendered, and API enforces it
   regardless).

Shared components to build once and reuse forever: `DataTable` (sorting,
pagination, empty state), `PageHeader`, `StatusBadge`, `ConfirmDialog`,
`FormSection`. These become the design-system seeds for every later
version.

---

## 5. Non-functional requirements

- p95 < 300ms for student search on 10k seeded rows locally (add the
  pg_trgm index; verify with EXPLAIN if slower).
- API rate limit: 100 req/min per user (Nest throttler), 10 req/min on
  /auth/login per IP.
- CORS locked to the web app origin. Helmet enabled.
- .env.example lists every variable; the app refuses to boot with missing
  required env (validated at startup with Zod).

---

## 6. Build order (the actual Claude Code prompt sequence for v0.1)

Each prompt = one Claude Code session ending in a green build.

1. **Scaffold**: monorepo (pnpm workspaces), docker-compose (pg16, redis7),
   NestJS app with health endpoint, React app with login page shell,
   packages/shared, CI script (`pnpm typecheck && pnpm lint && pnpm test`).
2. **Schema + seed**: full Prisma schema from §1, initial migration,
   seed script, PrismaService with tenant-scoping helper.
3. **Auth**: login/refresh/logout/me, JWT guards, roles guard, @Public(),
   token rotation, e2e tests incl. reuse-detection.
4. **Schools + setup**: schools CRUD (super admin), sessions/terms/
   class-levels/arms endpoints, activation transactions, e2e incl.
   cross-tenant tests.
5. **Students API**: all §2 student endpoints, admission-number generator,
   audit interceptor, trigram search, full e2e matrix.
6. **Web auth + shell**: login flow, token storage (memory + refresh on
   401 via interceptor), app layout, route guards.
7. **Web students**: list, create, detail, edit, withdraw, transfer —
   wired to real API, all states handled.
8. **Web settings + dashboard**: settings pages, dashboard stats endpoint
   + page, seed data verification, polish pass at 360/768/1280px.

---

## 7. Acceptance criteria (v0.1 is done when all pass)

- [ ] Fresh clone → `docker-compose up` → migrated, seeded, both apps up.
- [ ] Login as admin@sunrise.test works; wrong password → generic error.
- [ ] Creating a student generates SUN/2026/XXXX and appears in search
      within the list page without manual refresh (query invalidation).
- [ ] Duplicate admission number → 409 surfaced inline on the form.
- [ ] Teacher account can view students but every mutation returns 403.
- [ ] A second seeded school's admin sees zero Sunrise students; fetching
      a Sunrise student ID directly returns 404.
- [ ] Withdrawn students excluded from default list, visible with
      status=WITHDRAWN filter, and show the reason in their audit trail.
- [ ] All e2e suites green; typecheck and lint clean; no `any`.
- [ ] Every page usable at 360px width.