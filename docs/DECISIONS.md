# Decisions log

## 2026-07-14 — DataTable: page-local sort only, search/filters stay outside, mobile card is an explicit render-prop
Decision: the shared `DataTable<T>` (`apps/web/src/components/DataTable.tsx`) owns rows, pagination, and
loading/empty/error states only. Sorting is a client-side sort of whatever
page is already loaded, not a global sort — no list endpoint in this API
accepts a sort parameter, so a real cross-page sort isn't "cheap," a
page-local one is. Search and filters are NOT owned by the table; they're
sibling UI on the page (`StudentsListPage`), since future tables (grades,
attendance) will want very different filter sets. Mobile rendering is an
explicit `renderMobileCard(row)` prop rather than an auto-derived card from
column defs, for the same reason.
Reason: this component is meant to outlive step 7 (SPEC_V0.1.md §4: "built
once, reused forever") — baking in assumptions that only fit Students would
make it harder to reuse, not easier.

## 2026-07-14 — Form sections are generic over field shape, not over a single DTO type
Decision: `StudentBioFields`/`StudentGuardianFields` are generic components
constrained to a minimal field-shape interface (`BioFieldsShape`,
`GuardianFieldsShape`, all fields optional) rather than tied to
`CreateStudentInput` specifically. `packages/shared/src/students.ts` builds
`createStudentSchema` and `updateStudentSchema` from the same `bioSchema`/
`guardianSchema` sub-schemas via `.merge()`/`.partial()`, so both input
types satisfy the shared shape. This is what lets `/students/new` and the
Edit dialog render the identical two components with zero duplication.
Reason/confirmed gotcha: the shape fields must be optional even though
`CreateStudentInput`'s are required — `UpdateStudentInput` is `.partial()`
(all fields optional), and TypeScript correctly rejects a generic
constraint stricter than one of its actual callers.

## 2026-07-14 — TEACHER's class-arm filter is absent, not broken, when GET /class-arms 403s
Decision: `useClassArms()` (`apps/web/src/features/students/use-class-arms.ts`)
sets `retry: false`, and the class-arm filter dropdown on the students list
only renders once that query has real data — on error (TEACHER's request
403s, since `GET /class-arms` is SCHOOL_ADMIN-only server-side, unchanged
this step) the filter simply doesn't render.
Reason: consistent with "absent, not disabled" already used for TEACHER's
missing mutation buttons — a visibly broken/empty dropdown would be worse
than no dropdown, and loosening that endpoint's RBAC was out of scope.

## 2026-07-14 — Dev-time gotcha: Vite's dependency cache goes stale when packages/shared gains new exports
Confirmed gotcha, not a code bug: after adding `students.ts`/`pagination.ts`
to `packages/shared`, the already-running local Vite dev server threw
`Cannot read properties of undefined (reading 'parseAsync')` on the new
`createStudentSchema` import — its pre-bundled `@scholametric/shared` cache
(`node_modules/.vite/deps`) predated the new exports. Fixed by restarting
with `vite --force` (or deleting `node_modules/.vite`). Same root cause as
step 6's `optimizeDeps.include` decision, different symptom — worth knowing
before assuming a real bug when `packages/shared` grows mid-session.


## 2026-07-14 — GET /students list now includes currentEnrollment (user-approved backend change in a frontend step)
Decision: `StudentsService.findAll` gained the same `include: studentProfileInclude`
that `findOne` already used, mapping each row through the existing
`toProfile()`. Every list item now carries `currentEnrollment` (class arm +
level + session), not just bare `Student` columns.
Reason: step 7's students table needs a "class (level + arm)" column per
row; the list endpoint previously returned none of that, and doing an
N-per-page follow-up request (~20-100 on the JSS 2 A view) would work
directly against "must stay fast." Flagged per CLAUDE.md §8 and explicitly
approved by the user rather than assumed — the one exception to step 7's
"no backend changes" scope. Purely additive: no schema change, no new
endpoint, identical shape to what `GET /students/:id` already returned.


## 2026-07-13 — Refresh token stays in memory too; a reload logs the user out
Decision: both the access token and refresh token live only in a
module-level store (`apps/web/src/lib/auth-store.ts`), never in
`localStorage`/`sessionStorage`. There's no rehydration step on boot — a
page reload always starts unauthenticated, and the route guard just
renders `/login` (no error, nothing broken).
Reason: an httpOnly-cookie refresh token would survive reloads without an
XSS-exfiltration risk, but needs API changes (out of scope this step).
Storing the refresh token in `localStorage` instead would preserve the
session across reloads but reintroduce exactly the long-lived,
script-readable credential the "never localStorage" rule exists to avoid.
Given the choice, this step takes the safer side: zero persistent
credentials in browser storage, at the cost of session persistence.

## 2026-07-13 — API client dedupes concurrent refresh attempts
Decision: `apps/web/src/lib/api-client.ts` holds a single in-flight
`refreshPromise`; any request that 401s while a refresh is already running
awaits that same promise instead of calling `/auth/refresh` again.
Reason: the backend (step 3) rotates the refresh token on every use and
revokes the whole session if a rotated-away token is presented again. Two
API calls 401-ing around the same time and each independently calling
refresh would mean the second call presents an already-rotated token,
triggering reuse detection and logging the user out — a real bug the
dedupe exists specifically to prevent.

## 2026-07-13 — Auth state is a plain external store, not React Context
Decision: `authStore` (`apps/web/src/lib/auth-store.ts`) is a module-level
object with `subscribe`/`getState`, exposed to components via
`useSyncExternalStore`. `useIsAuthenticated()` wraps it for route guards.
Reason: the API client (plain fetch-wrapping functions, not a component)
needs to read the current token and clear it on failed refresh. Context
only reaches components; a plain store reaches both, and
`useSyncExternalStore` keeps React's re-renders correct without an extra
state-management library.

## 2026-07-13 — Hand-rolled Dialog/modal, no Radix
Decision: `apps/web/src/components/ui/dialog.tsx` implements the school
picker's modal directly (Escape to close, backdrop click to close, focus
restored to the previously-focused element on close) rather than adding
`@radix-ui/react-dialog`.
Reason: every existing `ui/` primitive in this repo (button, card, input,
label) is already hand-rolled shadcn-style, not Radix-backed. Adding Radix
now for just one component would be inconsistent with that established
precedent; a full Tab-cycle focus trap was left out since SPEC_V0.1.md §4
only requires arrow-key list navigation and Escape-to-close, not a full
trap.

## 2026-07-13 — Removed the login page's health-check badge
Decision: `LoginPage` no longer shows the "API reachable" badge from step
1; `apps/web/src/lib/api.ts` (`fetchHealth`) was deleted along with its
tests.
Reason: the amended SPEC_V0.1.md §4 login page design (school picker +
email + password) replaces the step-1 placeholder shell entirely, and
nothing else in the app used `fetchHealth`. The shared-types "live wire"
proof this badge existed for for (docs/DECISIONS.md, step 1) is now carried
by real code instead: `LoginInput`, `LoginResponse`, `CurrentUser`,
`SchoolSearchResult`, and `ApiErrorBody` from `@scholametric/shared` are
all wired into functioning login/shell code, not a dead import.

## 2026-07-13 — Vite must be told to pre-bundle @scholametric/shared
Decision: `apps/web/vite.config.ts` sets `optimizeDeps.include:
["@scholametric/shared"]`.
Reason/confirmed gotcha: caught by manual browser verification, not by
`tsc` or Vitest (both run in Node, where CJS/ESM interop is transparent).
`packages/shared` builds CommonJS on purpose (`apps/api` consumes it via
ts-node/Jest, which need CJS) — but Vite treats a pnpm-workspace symlinked
package as "linked source" and skips the normal dependency pre-bundling
step that would otherwise convert CJS to browser-usable ESM. Without this,
the browser fetched the raw `module.exports` file directly and failed with
"does not provide an export named 'loginSchema'" — the page rendered blank
white. Any future real-value (non-type-only) import from `packages/shared`
into `apps/web` depends on this staying set.


## 2026-07-13 — Nigerian class sizes: design for 100+ students per arm
Nigerian class sizes average 51, up to 101+ in some regions. All future
class-scoped UIs (grade entry v0.4, attendance v0.5, class lists step 7)
must be designed for 100+ students per arm: bulk entry patterns, no
per-student page-hopping for batch tasks.

## 2026-07-13 — Admission-number concurrency: Postgres advisory lock, not a sequence table
Decision: `StudentsService.generateAdmissionNumber` runs
`SELECT pg_advisory_xact_lock(hashtext('{schoolId}:{year}'))` (via
`tx.$executeRaw`, inside the same interactive transaction as the student
insert) before reading the max existing sequence for that (school, year) and
incrementing. The lock is transaction-scoped — released automatically on
commit or rollback, no cleanup code needed.
Reason: schema changes are out of scope this step, so a dedicated counter
table wasn't an option. Row-level locking (`SELECT ... FOR UPDATE`) doesn't
protect the *first* insert for a new (school, year) pair — there's no row
yet to lock — whereas an advisory lock keyed on the pair serializes
allocation regardless of whether any row exists.

## 2026-07-13 — Admission-number sequence resets per (school, year), not globally per school
Decision: the 4-digit sequence in `{prefix}/{year}/{NNNN}` is scoped to the
(school, year) pair — computed by scanning existing numbers with that year's
prefix and taking max+1 — not a single running counter per school.
Reason: SPEC_V0.1.md §1 says "4-digit sequence per school" without
specifying whether it resets per year, but embeds the session start year in
the format; a sequence indifferent to year would make that year component
decorative rather than meaningful. Resetting per year is also what real
Nigerian school admission numbering conventionally does.

## 2026-07-13 — Students API RBAC: SUPER_ADMIN gets 403, not 404
Decision: `StudentsController`'s class-level `@Roles()` lists only
`SCHOOL_ADMIN` and `TEACHER` (further restricted to `SCHOOL_ADMIN` alone per
mutation) — `SUPER_ADMIN` never appears, so `RolesGuard` 403s it uniformly
before any tenant/service logic runs.
Reason: 404 is reserved everywhere else in this codebase for "right role,
wrong tenant/resource." SUPER_ADMIN has no school-student access at all,
regardless of ID — that's a role problem, not a lookup problem, so 403 is
the answer consistent with every other controller.

## 2026-07-13 — Audit interceptor: global but decorator-gated, awaited before the response, scoped to students + step-4 modules
Decision: `AuditInterceptor` is registered as a global `APP_INTERCEPTOR` but
no-ops unless the handler carries the new `@Audit(entityType, action)`
decorator. It `await`s the `audit_logs` insert inside a `concatMap` (not a
fire-and-forget `tap`) so the row is guaranteed to exist by the time the
response reaches the caller. `metadata` is the raw `request.body` — this is
what makes the withdraw `reason` land automatically with no special-casing.
Applied to students plus the four step-4 controllers (sessions/terms/
class-levels/class-arms mutations); deliberately **not** applied to
`SchoolsController` or `AuthController`.
Reason: for students and the step-4 modules, `request.user.schoolId` (the
JWT's tenant) always equals the entity's own school — that's the whole
tenant-scoping model. For `POST /schools`, it wouldn't: the actor is
SUPER_ADMIN, whose JWT `schoolId` is the platform school, not the new
school being created. Logging the platform school for "a school was
created" would be misleading, and the task's own scope explicitly named
"students AND the step-4 modules," not schools/auth.

## 2026-07-13 — Fixed a step-4 test-isolation bug: activation left sunrise with no current session
Decision: `academic-setup.e2e-spec.ts`'s "session activation" test flips
`isCurrent` onto a temporary session and its `afterAll` deleted that session
but never restored the original seeded session's `isCurrent: true` —
leaving Sunrise with *no* current session for every test file that ran
afterward (including, this step, `students.e2e-spec.ts`'s very first
`POST /students`, which failed with "No current academic session configured"
against real seeded data, not mocks). Fixed by having that `afterAll`
explicitly reactivate the original session after deleting the temporary one.
Reason: confirmed gotcha, not a hypothetical — this broke a real local run.
Any future test that activates a session/term must restore prior state in
its own cleanup; there's no global "reset between test files" here.


## 2026-07-12 — Activate endpoints: deactivate-then-activate, in one transaction, after a pre-check
Decision: `SessionsService.activate` / `TermsService.activate` run
`prisma.$transaction([updateMany(deactivate others), update(activate target)])`
in that exact order, preceded by a tenant-scoped `findFirst` (not inside the
transaction).
Reason: the partial unique indexes (`... WHERE is_current = true`) are
checked per-statement, not deferred — activating before deactivating would
momentarily hold two current rows for the same scope and violate the index.
The pre-check matters independently of ordering: the transaction's own
`update({ where: { id } })` has no `school_id` filter, so without it a
cross-tenant activate/patch would silently succeed against another school's
row.

## 2026-07-12 — @Roles() placement: class-level for school-setup, per-method for SchoolsController
Decision: `SessionsController`/`TermsController`/`ClassLevelsController`/
`ClassArmsController` each carry one class-level `@Roles(SCHOOL_ADMIN)`.
`SchoolsController` instead applies `@Roles(SUPER_ADMIN)` per-method (create/
findAll/findOne/update), leaving `search` with none.
Reason: `RolesGuard` falls back to class-level metadata when a method has
none — a class-level `@Roles()` on `SchoolsController` would also lock down
the pre-existing public `/schools/search` route from step 3.

## 2026-07-12 — TenantContext/forSchool now have real consumers; injected into services, not controllers
Decision: the four school-setup services take `TenantContext` in their
constructor and read `schoolId` internally; controllers never see it.
Reason: matches CLAUDE.md §4's stated architecture literally
("repositories/services receive a TenantContext"). Since `TenantContext` is
request-scoped, every service that injects it becomes request-scoped too
(Nest propagates this automatically) — expected, not a bug.

## 2026-07-12 — Prisma Date fields need `new Date(...)`, not the raw DTO string
Decision: `SessionsService`/`TermsService` wrap `dto.startsOn`/`dto.endsOn`
in `new Date(...)` before passing to Prisma, even though `class-validator`'s
`@IsDateString()` accepts a bare `"YYYY-MM-DD"`.
Reason/confirmed gotcha: Prisma's `DateTime`-backed `@db.Date` columns
reject a bare date string at the client layer ("premature end of input,
expected ISO-8601 DateTime") — caught by e2e tests exercising session/term
creation, not by typecheck (the DTO type is `string` either way).

## 2026-07-12 — Shared pagination DTO/helper and Prisma-unique-constraint→409 helper
Decision: `common/pagination/{pagination-query.dto,paginate}.ts` (page/pageSize
validation + the `{ items, total, page, pageSize }` envelope) and
`common/prisma/prisma-errors.ts` (`throwIfUniqueConstraint`, matches Prisma's
P2002) are shared across schools/sessions/terms/class-levels/class-arms.
Reason: every list endpoint and every unique-name conflict in this step needs
identical behavior (CLAUDE.md §5); one helper avoids five near-identical
copies.


## 2026-07-12 — Refresh tokens are opaque random strings, not JWTs
Decision: `refresh_tokens.token_hash` stores SHA-256 of a 48-byte random
`base64url` string returned to the client, not a signed JWT. Access tokens
remain signed JWTs (`JWT_ACCESS_SECRET`, 15m).
Reason: refresh validity is already a DB round trip (revocation/rotation
state lives only there), so a self-verifying JWT refresh token would just
duplicate that check with no benefit. `JWT_REFRESH_SECRET` is provisioned
and reserved for env-validation purposes even though it isn't consumed by
token-signing code yet.

## 2026-07-12 — Refresh-token "family" = all of a user's tokens, not a per-chain family_id
Decision: reuse detection (presenting an already-revoked refresh token)
revokes every non-revoked `refresh_tokens` row for that `user_id`, not just
the rotation chain the reused token came from. No `family_id` column was
added — schema changes were explicitly out of scope for this step.
Reason: matches the spec's own wording ("revokes the entire family for that
user") and needs no migration; the tradeoff is that a user's *other*, unrelated
sessions also get logged out on reuse, which is an acceptable false-positive
cost for v0.1.

## 2026-07-12 — Login timing-safety via a precomputed dummy bcrypt hash
Decision: `bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)` always
runs, where `DUMMY_HASH` is `bcrypt.hashSync(...)` computed once at module
load (cost 12), never a real credential.
Reason: keeps bcrypt compare cost identical whether the school, email, or
active-user lookup failed, so response timing can't distinguish "unknown
account" from "wrong password."

## 2026-07-12 — Two separate JWT secrets, both required at boot
Decision: `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, both `min(32)` chars,
added to the Zod `envSchema` with no defaults.
Reason: compromising one shouldn't compromise the other; boot-time
validation matches the existing "refuse to boot with missing required env"
rule (SPEC_V0.1.md §5).

## 2026-07-12 — Global AllExceptionsFilter added in step 3, not step 1/2
Decision: `src/common/filters/all-exceptions.filter.ts` implements the
`{ statusCode, message, error, path, timestamp }` envelope from CLAUDE.md §5
and is wired via a shared `configureApp()` (`src/bootstrap.ts`) used by both
`main.ts` and the e2e test bootstrap.
Reason: auth is the first module producing real 401/403/429/400 responses;
no prior step needed it since `/health` never errors in a way clients see.

## 2026-07-12 — Custom ThrottlerGuard tracks by user id when authenticated, IP otherwise
Decision: `AppThrottlerGuard` overrides `getTracker` to return
`req.user?.userId ?? req.ip`. Verified against `@nestjs/core`'s
`GuardsConsumer.tryActivate` (runs global guards in the exact order they're
registered as `APP_GUARD` providers) that `JwtAuthGuard` must be registered
*before* `AppThrottlerGuard` in `AppModule` for this to work — otherwise the
throttler always runs first, `request.user` is never set yet, and every
route silently falls back to IP-only tracking. Route-level `@Throttle()`
overrides tighten `/auth/login` (10/min/IP) and `/schools/search`
(30/min/IP) per spec.
Reason: default `nestjs/throttler` only tracks by IP; CLAUDE.md §5 asks for
100/min *per user* globally.

## 2026-07-12 — @nestjs/jwt, @nestjs/throttler, class-validator, class-transformer added
Decision: four new dependencies in `apps/api/package.json`.
Reason: each is required to implement something CLAUDE.md already mandates
by name — "JWT" (§2), "Nest throttler" (§5), "class-validator DTOs" (§2/§5) —
not a substitution for anything in the fixed stack.


## 2026-07-12 — Prisma schema (10 tables), hand-written migration for what the DSL can't express
Decision: full Prisma schema for every SPEC_V0.1.md §1 table. IDs use
`@default(uuid(7))` (client-side UUIDv7, no DB extension needed).
`citext`/`pg_trgm` enabled via `extensions = [citext, pg_trgm]` +
`previewFeatures = ["postgresqlExtensions"]`. `refresh_tokens` has no
`school_id` column (only reachable via `user_id`, whose owning user
already carries `school_id`) — a deliberate exception to CLAUDE.md §4's
general rule, following the spec's explicit table definition.
Reason: matches spec exactly; `refresh_tokens` scoping is transitive and
never queried cross-tenant directly.

## 2026-07-12 — Partial unique indexes and trigram indexes are hand-written SQL, not in schema.prisma
Decision: `apps/api/prisma/migrations/20260712104944_init/migration.sql`
was generated via `prisma migrate dev --create-only`, then hand-edited to
add: `academic_sessions_one_current_per_school` and
`terms_one_current_per_session` (partial unique indexes, `WHERE
is_current = true`), plus `students_first_name_trgm_idx` /
`students_last_name_trgm_idx` (GIN + `gin_trgm_ops`, for ILIKE name
search per §5). None of these are declared in `schema.prisma` — Prisma's
DSL has no syntax for partial indexes or operator classes.
Reason/confirmed gotcha: verified via `prisma migrate diff
--from-migrations ... --to-schema-datamodel ...` that running a bare
`prisma migrate dev` after this proposes `DROP INDEX` on the two
**trigram** indexes (they're plain GIN indexes Prisma can "see" but
doesn't recognize as wanted). The **partial** unique indexes were *not*
flagged — Prisma's diffing appears not to model partial indexes at all,
so they're silently safe. **Rule for every future migration in this
repo: always run `prisma migrate dev --create-only` first and read the
generated SQL before applying — if it contains `DROP INDEX
"students_first_name_trgm_idx"` or `"students_last_name_trgm_idx"`,
delete those lines before applying.**

## 2026-07-12 — Health check switched from raw pg to PrismaService
Decision: `HealthService`'s DB check now runs `prisma.$queryRaw` via the
shared `PrismaService` instead of a one-off `pg.Client`. The `pg`
dependency was removed from `apps/api/package.json`.
Reason: step 1 justified the raw client because no ORM/schema existed
yet; now that Prisma is set up, a second direct-`pg` connection just for
health checks is redundant.

## 2026-07-12 — TenantContext + forSchool scaffolding added, no consumers yet
Decision: `apps/api/src/common/tenant/tenant-context.ts` (request-scoped,
reads `request.user?.schoolId`, throws if accessed before a guard
populates it) and `for-school.ts` (`forSchool(schoolId, where)` helper)
per CLAUDE.md §4's required structural pattern. Nothing consumes them
yet — no `JwtAuthGuard`/`request.user` exists until step 3.
Reason: scaffolding requested explicitly for step 2 so step 3+ domain
modules have the seam ready.

## 2026-07-12 — Health check uses raw pg/ioredis, not Prisma
Decision: `HealthService` pings Postgres and Redis with the `pg` and `ioredis`
clients directly instead of via Prisma.
Reason: no Prisma schema exists yet (step 2 scope) — introducing one just to
back a health check would be premature.

## 2026-07-12 — Global JwtAuthGuard not wired yet
Decision: no global auth guard is registered in step 1; the only route
(`GET /health`) is reachable with no guard at all, not via an `@Public()`
bypass.
Reason: no auth strategy/module exists yet (step 3 scope); a global guard
with nothing behind it would just break boot.

## 2026-07-12 — No client-side router added yet
Decision: `apps/web/src/App.tsx` renders `LoginPage` directly; no
`react-router-dom` dependency added.
Reason: not part of the fixed tech stack in CLAUDE.md §2, and step 1 only
needs a single static route. Routing/guards are introduced in step 6 (web
auth + shell) per `docs/SPEC_V0.1.md` §6.

## 2026-07-12 — No combined root `dev` script
Decision: README documents running `apps/api` and `apps/web` dev servers in
two separate terminals instead of adding a `concurrently` dependency for a
single root `dev` script.
Reason: keeps step 1 dependencies to only what's in the fixed stack.

## 2026-07-12 — e2e test env vars set via Jest `setupFiles`, not `beforeAll`
Decision: default `DATABASE_URL`/`REDIS_URL`/`CORS_ORIGIN` for the e2e suite
are set in `test/setup-env.ts`, wired via `setupFiles` in `jest-e2e.json`.
Reason: `ConfigModule.forRoot({ validate })` runs eagerly when `AppModule` is
imported, which happens before `beforeAll` executes — setting env vars there
was too late and failed validation every run.

## 2026-07-12 — Dockerfiles copy full source before `pnpm install`
Decision: `apps/api/Dockerfile` and `apps/web/Dockerfile` copy
`packages/shared` and the app's own source in full before running
`pnpm install --frozen-lockfile`, rather than copying only `package.json`
files first for layer-cache optimization.
Reason: the root `prepare` script builds `packages/shared` on every
install; with only `package.json` copied, `tsc` had no `src/` to compile
and the build failed. Correctness over cache-layer optimization at this
repo size.

## 2026-07-12 — packages/shared wiring is a live health-check badge, not a type-only import
Decision: `apps/web` imports `HealthResponse` from `@scholametric/shared` to
type a TanStack Query hook that shows an "API reachable" badge on the login
page, rather than an unused type-only import.
Reason: proves the shared-types contract with real, functioning code instead
of a dead import that only exists to satisfy a rule.

## 2026-07-13 — Users module built in step 8, not step 4 (a real backend gap)
Decision: SPEC_V0.1.md §2 describes a full Users module (list/create/edit/
reset-password) but step 4's commit never built it — only schools,
sessions, terms, class-levels, and class-arms landed. Discovered while
planning step 8's `/settings/users` page, which depends on it entirely.
Reason: flagged to the user rather than assumed (CLAUDE.md §8); user chose
to build it now, same rigor as the other step-4 modules (DTOs, RBAC, e2e
matrix including cross-tenant 404 and self-demote 400).

## 2026-07-13 — User creation and password reset both return a one-time generated password
Decision: `POST /users` takes no password field; the server generates one
(and so does `POST /users/:id/reset-password`), returned once in the
response body and never retrievable again.
Reason: SPEC_V0.1.md §4 describes creating a user "via drawer/dialog" with
no password field, and reset-password already required generating one —
using the same mechanism for creation avoids a second, inconsistent code
path and matches how the admin actually hands off credentials (verbally or
by copy-paste), not by choosing them for someone else.

## 2026-07-13 — Password reset revokes the user's existing refresh tokens
Decision: `POST /users/:id/reset-password` also sets `revokedAt` on every
non-revoked refresh token for that user, in the same transaction as the
password change.
Reason: a password reset that leaves an already-issued session valid
defeats the point of the reset (e.g. resetting because a device was lost).
Not in SPEC_V0.1.md explicitly, but a direct security consequence of the
endpoint that already exists — not new scope.

## 2026-07-13 — GET /auth/me's school object gained address/phone/email
Decision: added three nullable fields to the `school` object already
returned by `GET /auth/me`, alongside the existing `id`/`name`/`slug`/
`type`/`status`. No new endpoint, no RBAC change.
Reason: `PATCH /schools/:id` is confirmed SUPER_ADMIN-only (SPEC_V0.1.md
§2), so `/settings/school` renders read-only for SCHOOL_ADMIN per explicit
user instruction — but SPEC_V0.1.md §4 still calls for the profile to show
name/address/phone/email, and `GET /auth/me` (which SCHOOL_ADMIN already
has full access to) didn't expose the latter three. Same category as step
7's `currentEnrollment` precedent: a small additive field on an endpoint
the caller already owns, not a permission expansion.

## 2026-07-13 — /settings/school is read-only for SCHOOL_ADMIN (v0.2 question)
Decision: the school profile page has no Edit action for SCHOOL_ADMIN;
editing name/address/phone/email is not available in v0.1.
Reason: `PATCH /schools/:id` is SUPER_ADMIN-only per the step-4 RBAC matrix
(SPEC_V0.1.md §2), and CLAUDE.md §8 forbids changing backend RBAC without
being asked. Open question for v0.2: should SCHOOL_ADMIN be allowed to
edit their own school's contact details (not `slug`/`type`/`status`)?

## 2026-07-13 — Dashboard studentsByLevel uses one raw SQL query, not Prisma groupBy
Decision: `GET /dashboard/stats` computes the per-class-level student
counts with a single parameterized `$queryRaw` (join students →
student_enrollments → class_arms → class_levels, grouped by level),
instead of Prisma's `groupBy` or a per-level count loop.
Reason: Prisma's `groupBy` can't express the multi-table join needed here
in one call; CLAUDE.md §2 explicitly allows raw SQL for reports. Postgres
`uuid` columns require explicit `::uuid` casts on the interpolated
`schoolId`/`sessionId` params — Prisma's tagged-template raw query doesn't
infer parameter types, caught by an e2e test failure (`operator does not
exist: uuid = text`) before it reached production.

## 2026-07-13 — recharts added to the approved frontend stack (v2, not v3)
Decision: added `recharts@^2` as a direct dependency of apps/web for the
dashboard's students-by-level bar chart; pinned to the v2 major (v3 exists
but wasn't requested and isn't needed here — CLAUDE.md §2 says don't
upgrade majors without asking, and the user only asked for "recharts",
not a specific major).
Reason: user explicitly named recharts in the step-8 instructions (SPEC
§4 item 2), which is the required approval per CLAUDE.md §2's "no
libraries beyond these without asking." Amended in CLAUDE.md's stack
table as its own commit, same pattern as react-router-dom in step 6.

## 2026-07-13 — jsdom needs a ResizeObserver stub for recharts tests
Decision: added a minimal `ResizeObserver` stub to `src/test/setup.ts`
(observe/unobserve/disconnect as no-ops), applied globally.
Reason: recharts' `ResponsiveContainer` (used by the dashboard chart)
calls `new ResizeObserver(...)` on mount; jsdom has no such global and the
component throws, crashing any test that renders it. The stub never needs
to fire callbacks since jsdom has no real layout to observe anyway —
DashboardPage's tests only assert on data-driven text content, not pixel
dimensions.

## 2026-07-13 — Settings pages: routed top-level tabs, local-state sub-tabs
Decision: `/settings/school`, `/settings/academic`, `/settings/users` are
real routes under a `SettingsLayout` (so they're deep-linkable and survive
a reload... within the same login session), but *within* `/settings/academic`
the Sessions/Terms vs Class-levels/Arms split is local `useState`, not
nested routes.
Reason: the top-level split is a real navigation destination (matches
SPEC_V0.1.md §4's three named settings pages); the sub-split is an
implementation detail of one page, not something a user would want to
bookmark or share a link to. Same tab-bar pattern as StudentDetailPage's
Overview/History tabs from step 7, reused rather than reinvented.

## 2026-07-13 — Global search reuses GET /students?search=, no new endpoint
Decision: the top-bar global search (SPEC_V0.1.md §4 layout) calls the
existing `GET /students?search=&page=1&pageSize=8`, the same endpoint the
students list page uses, rather than adding a dedicated search endpoint.
Reason: the existing endpoint already does ILIKE/trigram search on name
and admission number and is tenant-scoped correctly — a second endpoint
would duplicate that logic for no benefit at this data volume.

## 2026-07-13 — User creation and reset-password share one OneTimePasswordDisplay component
Decision: `features/settings/OneTimePasswordDisplay.tsx` (copy button +
"won't be shown again" warning) is used by both `CreateUserDialog` and
`ResetPasswordDialog`, each of which otherwise manages its own two-step
(form/confirm → reveal) dialog flow independently rather than sharing a
bigger abstraction.
Reason: the one-time-password reveal is identical in both flows and worth
not duplicating; the surrounding flow (create form vs. confirm-then-reset)
differs enough that forcing them into one shared component would need
more conditional branching than the two call sites are worth.

## 2026-07-17 — /users left unchanged; only reset-password becomes a real alias
Decision: v0.2's Personnel module (`/personnel`) supersedes v0.1's `/users`,
but `GET`/`POST`/`PATCH /users` are untouched — no `PROPRIETOR` added to
their `@Roles()`, no staff_profile awareness. Only
`POST /users/:id/reset-password` now delegates to `PersonnelService`
(injected into `UsersModule`) and additionally accepts `PROPRIETOR`.
Reason: SPEC_V0.2.md §2 only says reset-password is "moved... kept as
alias"; adding PROPRIETOR to /users' create/edit would let it mint
SCHOOL_ADMIN/TEACHER users with no staff_profile, silently violating this
version's "every such user has one" invariant. CLAUDE.md §8's "extend,
never rewrite" argues against touching working endpoints beyond what's asked.

## 2026-07-17 — POST /personnel takes a caller-supplied password (unlike v0.1's /users)
Decision: `CreatePersonnelDto.password` is required and caller-supplied,
same shape as `POST /schools`'s admin sub-object — not server-generated
like v0.1's `POST /users`, which returned a `temporaryPassword` once.
Reason: SPEC_V0.2.md §2 lists `password` explicitly in the POST /personnel
body, a deliberate spec difference from v0.1, not an oversight. Reset-password
(both `/personnel` and the `/users` alias) keeps the generate-and-reveal-once
behavior — only creation changed.

## 2026-07-17 — PersonnelSummary uses `id`, not `userId`, for the response's identity field
Decision: the personnel/teachers response shape names the user's id `id`
(with `staffProfileId` as a secondary field for the profile row), even
though the route param is `:userId`.
Reason: `AuditInterceptor` reads a generic `response.id` to know what to
write into `audit_logs.entity_id`; a `userId`-only response would silently
produce zero audit rows for every personnel mutation, caught before
shipping by checking the interceptor's source, not by a failing test.

## 2026-07-17 — DELETE endpoints return `{ id }` (200), not empty 204
Decision: `DELETE /class-arms/:id/class-teacher` and
`DELETE /subject-assignments/:id` both return `{ id: <deleted row's id> }`
with an implicit 200, rather than a bodyless 204.
Reason: same root cause as above — these are the first true DELETE
endpoints in the API, and AuditInterceptor's `response.id` lookup needs
something to read. A 204 would make these two mutations silently unaudited.

## 2026-07-17 — Personnel/Teachers reset-password checks the User table, not StaffProfile
Decision: `PersonnelService.resetPassword` looks up the target via
`prisma.user.findFirst`, not `staffProfile.findFirst` (unlike `update`,
which does require a staff profile).
Reason: this method is also reached via the deprecated `/users/:id/reset-password`
alias, which must keep working for any tenant user — including ones
predating staff_profiles entirely (confirmed against a manually-created
bare user in e2e). A password reset only touches `users`/`refresh_tokens`;
requiring a staff_profile here would be a regression, not a feature.

## 2026-07-17 — Class-teacher is upsert-replace; subject-teacher is insert-with-named-409
Decision: `PUT /class-arms/:id/class-teacher` silently replaces the
current session's assignment (no conflict possible — one arm, one class
teacher). `POST /subject-assignments` refuses a taken `(subject, arm,
session)` slot with a 409 naming the current holder; reassigning requires
an explicit `DELETE` first.
Reason: matches SPEC_V0.2.md §2's stated semantics exactly for each
endpoint — not an inconsistency, a deliberate difference (a class only
ever has one class teacher to overwrite; a taken subject slot implies
someone else's schedule already depends on it, worth surfacing explicitly).

## 2026-07-17 — "cannot demote the last admin" only fires on a change TO TEACHER
Decision: `PersonnelService.update`'s last-admin guard only triggers when
`dto.role === TEACHER` and the target currently holds `PROPRIETOR` or
`SCHOOL_ADMIN`; a PROPRIETOR↔SCHOOL_ADMIN transition is never blocked by
it, regardless of remaining admin count.
Reason: matches SPEC_V0.2.md §2's literal wording ("cannot change the last
PROPRIETOR/SCHOOL_ADMIN... to TEACHER"); both remaining roles keep
school-admin-level access, so there's no "last admin" hazard between them.

## 2026-07-17 — GET /classes is one raw SQL statement, current session resolved via CTE
Decision: `ClassesService.findAll` runs a single `$queryRaw` — a CTE
resolving the school's current session (or zero rows if none), LEFT
JOINed against `class_arms`/`student_enrollments`/`class_teacher_assignments`/`users`,
grouped by level+arm+teacher. No separate query to find the current
session first.
Reason: SPEC_V0.2.md §2 asked for "one efficient query" and proof of no
N+1. A missing current session isn't special-cased in the SQL: the CTE
returns no rows, so every session-scoped join condition compares against
NULL and never matches (Postgres `x = NULL` is never true), which
naturally yields enrollmentCount 0 / classTeacher null for every arm — the
same "no session = empty, not broken" convention as DashboardService.
Proved in classes.e2e-spec.ts by configuring PrismaService with query-event
logging and asserting the query count is identical for Sunrise (~125
students) and Hillcrest (5 students) — N+1 would show different counts.

## 2026-07-17 — PrismaService now supports query-event logging (test-only capability)
Decision: `PrismaService` extends `PrismaClient<Prisma.PrismaClientOptions,
"query">` and passes `{ log: [{ emit: "event", level: "query" }] }` to
`super()`.
Reason: enables `$on('query', ...)` for e2e tests to literally count SQL
round-trips per request — the only rigorous way to prove "not N+1" rather
than asserting on it indirectly. `emit: "event"` only enables listening; it
prints nothing and costs nothing unless a listener is attached, so this is
a no-op in production.

## 2026-07-17 — GET/POST/PATCH /class-arms stay PROPRIETOR/SCHOOL_ADMIN-only; only the new GET /class-arms/:id opens to TEACHER
Decision: the existing class-arms list/create/update endpoints keep their
step-7/8 RBAC (`PROPRIETOR`/`SCHOOL_ADMIN`, no `TEACHER`) unchanged. Only
the new `GET /class-arms/:id` (added this step, the Classes-tab arm detail)
gets a per-method `@Roles()` override adding `TEACHER`, same as the new
`GET /classes`.
Reason: SPEC_V0.2.md §2's RBAC matrix adds `TEACHER` read access to
"classes" as a new concept (the Classes tab), not to the older class-arm
management list — extending the old endpoint would reverse a documented
step-8 decision (hiding the class-arm filter dropdown from TEACHER) that
this step never asked to revisit.

## 2026-07-17 — POST /users/:id/reset-password's PROPRIETOR/SCHOOL_ADMIN caller check unchanged; personnel/teachers RBAC additions don't touch schools.controller.ts
Decision: `PATCH /schools/:id`'s new PROPRIETOR/SCHOOL_ADMIN path still
writes no `audit_logs` row, matching the original SchoolsController-wide
exclusion (see the 2026-07-13 entry above) — the interceptor logs under
`request.user.schoolId`, correct for a school user patching themselves,
wrong for SUPER_ADMIN patching a different school, and the interceptor has
no way to tell the two call paths apart.
Reason: adding `@Audit` only for one caller type isn't expressible with the
current decorator (it's a static route annotation, not caller-aware); doing
it unconditionally would reintroduce the exact misleading-log problem the
original exclusion was written to avoid.

## 2026-07-18 — v0.2 step 5 fixed a real pre-existing gap: PROPRIETOR was never added to the frontend's shared UserRole type
Decision: `packages/shared/src/auth.ts`'s `UserRole` union gained `"PROPRIETOR"` (backend
Prisma enum had it since v0.2 step 1). A new `apps/web/src/lib/roles.ts`
(`isSchoolAdmin(role)`, true for `PROPRIETOR` or `SCHOOL_ADMIN`) replaced
the ad-hoc `role === "SCHOOL_ADMIN"` checks in `useCanManageStudents` and
`SettingsLayout`'s route gate, and is used by every new Personnel/Teachers
role check this step.
Reason: this step's own RBAC requirement ("PROPRIETOR sees everything
SCHOOL_ADMIN does") doesn't type-check, let alone hold, without it — a
PROPRIETOR user would have silently lost student-management and Settings
access ever since that role was introduced. Discovered by inspection while
planning the sidebar/route-guard work, not by a failing test.

## 2026-07-18 — /settings/users is a bare redirect Route, not a SettingsLayout tab
Decision: `<Route path="/settings/users" element={<Navigate to="/personnel" replace />} />`
is registered at the top protected level in `App.tsx`, outside
`SettingsLayout`'s nested routes — not a fourth tab that itself redirects.
`/personnel` is guarded by a new `RequireSchoolAdmin` route-wrapper
component (loading-aware, then redirects non-admins to `/dashboard`),
mirroring `SettingsLayout`'s own existing gate rather than duplicating its
tab-bar UI for a route that has no tabs of its own.
Reason: SPEC_V0.2.md §4 says the route "redirects," not "shows a Users tab
that redirects" — nesting it under `SettingsLayout` would flash the
Settings tab-bar chrome before redirecting, for no benefit.

## 2026-07-18 — v0.1 Users UI deleted outright, not deprecated in place
Decision: `UsersSettingsPage`, `CreateUserDialog`, `EditUserDialog`,
`use-staff-users.ts` (and their test file) are deleted, not left dead.
`ResetPasswordDialog`/`OneTimePasswordDisplay` are kept but generalized —
moved to `features/personnel/` and `components/` respectively, now
type over a minimal `{ id, firstName, lastName }` shape instead of
`StaffUser`, and call `/api/v1/personnel/:userId/reset-password` instead
of `/api/v1/users/:id/reset-password`.
Reason: `/personnel` fully supersedes this page (SPEC_V0.2.md §4 §7); the
backend's `/users` endpoints stay deprecated-but-working (step 3
decision), but nothing in the frontend should keep calling them. Reusing
the two components matched CLAUDE.md §8's explicit instruction; the rest
of the page had no reason to survive.

## 2026-07-18 — Teachers list: class-teacher badge computed client-side; "subjects count" column dropped (flagged, user's choice)
Decision: `GET /teachers` (list) returns plain `PersonnelSummary` rows with
no assignment data at all. The list page's "class teacher of" badge is
computed by fetching `GET /classes` once for the whole page and building a
`teacherUserId -> arm labels` map client-side (`class-teacher-map.ts`) —
free, no N+1. A "subjects count" column, also asked for in the original
scope, has no equivalent data source (no `GET /subject-assignments` list
endpoint exists) and was dropped from the list table rather than adding a
backend field or an N+1 per-row fetch — user's explicit choice when
flagged. Full subject list is still visible on the teacher detail page,
which already has it.
Reason: flagged per CLAUDE.md §8 rather than silently picking a workaround;
the class-teacher badge had a genuinely free solution, the subjects count
did not.

## 2026-07-18 — Backend addition: SubjectTaughtEntry gained `id` (flagged, user's choice)
Decision: `TeachersService.findOne`'s `subjectsTaught` entries now include
the `SubjectTeacherAssignment`'s own `id` (`apps/api/src/teachers/teachers.service.ts`,
mirrored in `packages/shared/src/personnel.ts`). One field, no schema
change, no migration.
Reason: flagged mid-step-5 ("no backend changes" was the stated scope) —
the Subjects-taught table's explicitly-required "remove action" needs
`DELETE /subject-assignments/:id`, and the detail response had no id to
target at all. User chose the small backend addition over shipping the
table read-only. Covered by a new e2e assertion in `teachers.e2e-spec.ts`.

## 2026-07-18 — Add-subject dialog: one POST per selected arm, inline per-arm outcome
Decision: `AddSubjectAssignmentDialog` submits one `POST
/subject-assignments` per checked arm (sequentially, `mutateAsync` in a
loop, not `Promise.all`), and renders a success/error icon plus the exact
backend error message per arm row rather than a single toast. Arms that
succeed are not re-shown as selected; arms that conflict stay checked so
the admin sees exactly what still needs attention.
Reason: `POST /subject-assignments` only accepts one `classArmId` at a
time, and a single submission spanning several arms can partially succeed
(some arms open, others already taken) — SPEC_V0.2.md §4 explicitly wants
the named 409 "surfaced inline," which a page-level toast can't do
per-arm.

## 2026-07-18 — Class-teacher-of section also gets a per-row Remove (small addition beyond the literal spec text)
Decision: each arm in the Teacher detail page's "Class teacher of" list
has its own Remove button (`ConfirmDialog` + `DELETE
/class-arms/:id/class-teacher`), not just the "assign/replace" dialog the
instructions named explicitly.
Reason: the endpoint already exists and is safe (404s cleanly on a repeat
call); the "Subjects taught" section right below it already has an
equivalent per-row remove, and leaving class-teacher-of as
add-only-no-remove would be an inconsistent, arbitrarily incomplete
mirror of the same UX pattern one section down. Small, low-risk,
uses only endpoints already in scope.

## 2026-07-18 — Observed pre-existing test flake: auth-rate-limit.e2e-spec.ts immediately before schools-crud.e2e-spec.ts
Confirmed gotcha, not a regression: running the full backend e2e suite
occasionally has every test in `schools-crud.e2e-spec.ts` fail its
`beforeAll` login with a 5000ms Jest hook timeout — reproduces reliably
when Jest happens to schedule `auth-rate-limit.e2e-spec.ts` (which fires
11 rapid login attempts, each running a real bcrypt cost-12 compare)
immediately before it, and disappears when the file order changes or
either file runs alone. Neither file was touched this step. Not
investigated further (pre-existing test-infrastructure timing, out of
this step's scope) — worth knowing before assuming a real regression if
seen again; re-running the suite (file order isn't pinned) reliably
clears it.

## 2026-07-17 — /users' GET/POST/PATCH marked @deprecated (JSDoc only), no behavior change
Decision: per explicit pre-approved housekeeping scope, all four
`/users` endpoints (previously only reset-password) now carry a
`/** @deprecated ... */` JSDoc comment and an API.md note, with removal
planned for v0.3. No route, RBAC, or service logic changed.
Reason: keeps the deprecation signal consistent across the whole
controller now that `/personnel` fully supersedes it, without touching
behavior ahead of the actual removal (a separate, future decision).

## 2026-07-17 — POST/PATCH /students: breaking change, guardians move to their own tables (v0.2 step 4)
Decision: `POST /students` now takes `guardians: [{...}]` (min 1, each
either `{ guardianId, relationship }` to link an existing guardian or
`{ firstName, lastName, phone, relationship, email?, address? }` to create
one) instead of flat `guardianName`/`guardianPhone`/`guardianEmail`/
`address` fields. `PATCH /students/:id` no longer accepts any guardian
field at all — bio fields only. Confirmed via grep that only
`apps/web`'s v0.1 students UI (`NewStudentPage`, `EditStudentDialog`,
`StudentGuardianFields`, their hooks/tests) called the old shape; nothing
else in the API does. That frontend is expected to be broken for student
creation/editing until SPEC_V0.2.md §7 steps 5-7 rebuild it — pre-approved
by the user, who named this exact breaking change in the step-4 instructions.
Reason: SPEC_V0.2.md §2's guardian restructure (multi-guardian, sibling
linking, primary reassignment) has no room in a flat-fields shape; the old
shape can express at most one guardian per student and can't express "link
an existing guardian record."

## 2026-07-17 — Frozen legacy guardian columns are derived from the resolved primary guardian, not raw request fields
Decision: `students.guardian_name`/`guardian_phone` (`NOT NULL`, no
migration this step) /`guardian_email`/`address` are populated on
`POST /students` from the **resolved** primary `Guardian` entity (after
`resolveOrCreateGuardian` runs) — `guardianName: `${firstName}
${lastName}``, `guardianPhone: phone`, etc. — not from the raw DTO input.
Reason: raw input has no `firstName`/`lastName`/`phone` at all in
link-existing (sibling) mode, only a `guardianId`; deriving from the
resolved entity is the only option that works for both create-new and
link-existing. User's explicit choice (asked via clarifying question:
"derive from primary guardian" vs. inert placeholders) — keeps the
pre-v0.2 frontend, which still reads these flat columns until its own
guardians UI ships, showing real guardian info for new students rather
than blank/placeholder junk.

## 2026-07-17 — GET /students list item gets `primaryGuardian`, detail gets full `guardians[]`
Decision: `GET /students` list rows carry `primaryGuardian: { guardianId,
firstName, lastName, phone } | null` (one extra join, `take: 1`); `GET
/students/:id` carries the full `guardians: StudentGuardianSummary[]`
(every link, primary first). Two different Prisma `include` shapes
(`studentListInclude` vs `studentDetailInclude` in `students.service.ts`),
not one shared shape reused everywhere.
Reason: the students list page only needs "who to call," not a full
guardian roster per row across 100+ students; the detail page's guardians
tab needs everything. Flagged per the step-4 instructions ("flag the shape
you choose — the frontend list will want it") rather than assumed.

## 2026-07-17 — isPrimary is asymmetric between create-time and add-time guardian DTOs
Decision: `CreateStudentGuardianDto` (used inside `POST /students`'s
`guardians[]`) has an optional `isPrimary` field. `AddStudentGuardianDto`
(used by the standalone `POST /students/:id/guardians`) has **no
`isPrimary` field at all** — not accepted-but-ignored, absent from the
type.
Reason: at student-creation time there's no existing primary to steal from,
so choosing one explicitly is meaningful. Adding a guardian to a student
who already has guardians must never steal primary (SPEC_V0.2.md §2) — a
field that's silently ignored would be a more confusing contract than a
field that doesn't exist; the server always computes `isPrimary` here as
"true only if this is the student's first-ever guardian link."

## 2026-07-17 — Orphaned guardians (zero links school-wide) are soft-deleted on unlink
Decision: `StudentGuardiansService.remove` soft-deletes the `Guardian` row
(`deletedAt`) if, after removing the requested link, that guardian has zero
`student_guardians` rows anywhere in the school. Guardians still linked to
at least one other (sibling) student are untouched.
Reason: user's explicit design decision (SPEC_V0.2.md §2 unlink rules,
"a guardian left with zero links across the school gets soft-deleted" — I
did not disagree when asked to flag it). No endpoint lists "unlinked
guardians," so a guardian record with zero links would otherwise be
permanent dead data with no way to reach or clean it up.

## 2026-07-17 — Real concurrency bug found and fixed: primary-guardian swap needs a row lock, not just transaction ordering
Decision: `StudentGuardiansService.setPrimary` locks every
`student_guardians` row for the student (`SELECT id FROM student_guardians
WHERE student_id = $1 ORDER BY id FOR UPDATE`) inside an interactive
transaction, before deactivating the old primary and activating the new
one. The earlier "deactivate-then-activate" version — a batch
`prisma.$transaction([updateMany, update])`, the same shape as
`SessionsService.activate` — passed a naive test but **failed under a real
6-way concurrent `Promise.all` swapping between two different guardians**:
two concurrent swaps could each read "no other primary to deactivate"
before the other's write was visible, then both try to activate, and the
second to commit hit the partial unique index and 500'd. The first locking
attempt (no `ORDER BY`) then deadlocked instead under the same load,
because concurrent transactions could acquire the two rows' locks in
different orders. Adding `ORDER BY id` (a fixed lock-acquisition order)
fixed it — verified clean across 3 consecutive full test runs.
Reason: the user's step-4 instructions explicitly asked for a concurrency
test that "tries to break it," and it did. This pattern (batch
`$transaction([updateMany, update])` for an atomic activate-swap) is reused
elsewhere in this codebase (`SessionsService.activate`, `TermsService.activate`) —
those were **not** touched this step (out of scope, extend-never-rewrite),
but they likely share the same latent race and are worth auditing in a
future step.

## 2026-07-17 — seed.ts fixed to give every seeded student a primary guardian (from-scratch bootstrap gap)
Decision: `seedStudents`/`seedBulkClassArm` in `prisma/seed.ts` now call a
new `seedPrimaryGuardian()` helper that creates a `Guardian` +
primary `StudentGuardian` row per student, idempotently (skips if a
primary link already exists).
Reason: discovered while verifying CLAUDE.md §7's "`docker-compose up`
boots the full stack from scratch" on a genuinely empty volume — the v0.2
step-1 migration's guardian backfill only covers students that already
exist *at migration time*; on a fresh `migrate deploy` (empty `students`
table) followed by `prisma db seed`, the ~130 students seed.ts creates
directly via Prisma got zero guardian rows, violating this step's own
"every student has ≥1 guardian, exactly one primary" invariant. Not
something this step's code caused, but directly exposed by it — fixed
here rather than left as a known gap, per explicit user confirmation.
Verified: fresh `migrate deploy` + `seed` gives all 130 students a primary
guardian; re-running `seed` again produces no duplicate primaries.

## 2026-07-18 — v0.2 step 6: two more small backend additions, applied directly (established precedent, not re-asked)
Decision: `ClassArmDetail.subjectTeachers[]` gained `id` (the assignment's
own id — the arm page's remove action had nothing to target otherwise),
and `GET /subjects` (list) now includes `classLevels` per row (the
Subjects tab's "levels as chips" column has no other data source — no
per-subject GET exists). Both flagged in the step-6 plan but applied
directly rather than re-confirmed via a fresh question, since step 5
already established and got explicit approval for the identical pattern
twice (`SubjectTaughtEntry.id` and the "small backend addition" choice).
Reason: same reasoning as step 5's equivalent fixes — one field/one join,
no schema or migration change, purely additive.

## 2026-07-18 — Class-level/arm management fully removed from Settings, not duplicated; Edit dropped (flagged, deliberate)
Decision: `ClassLevelsSection`/`ClassArmsSection` and their Create/Edit
dialogs (`features/settings/`) are deleted outright — `AcademicSettingsPage`
is sessions & terms only now, no sub-tab. The Classes page only gets
**Add** level/arm (per SPEC_V0.2.md §4's literal wording); renaming an
existing level or arm has no UI anywhere in this step.
Reason: "class management moves to Classes" (spec) meant relocate, not
duplicate — leaving the old CRUD in Settings alongside the new Classes
page would be two places to manage the same data. Edit was deliberately
left out because it isn't named in this step's scope list (only "Add
level" and "Add arm" are); flagged in the plan rather than silently added
or silently dropped without mention. The backend `PATCH` endpoints are
untouched and still work — only their UI is gone until a future step adds
it back, if ever needed.

## 2026-07-18 — Assignment dialogs: hooks reused verbatim, relocated; UI components rebuilt as arm-centric mirrors
Decision: the six data hooks from step 5 (`useClasses`, `useSubjects` →
split into `useAllSubjects`/`useSubjectsList` with mutations,
`useSetClassTeacher`, `useRemoveClassTeacher`, `useCreateSubjectAssignment`,
`useRemoveSubjectAssignment`) moved from `features/teachers/` to
`features/classes/` verbatim (plus extra `["class-arm"]` cache invalidation
so the arm detail page refetches too) — both features now import one
copy. `AssignClassTeacherDialog`/`AddSubjectAssignmentDialog` themselves
were **not** reused: they're teacher-centric ("this teacher, pick an arm" /
"...pick subject + multiple arms"). The arm page needed the inverted axis
("this arm, pick a teacher" / "...pick one subject + one teacher"), so
`AssignClassTeacherForArmDialog`/`AddSubjectTeacherDialog` are new
components sharing only the mutation hooks, `Dialog`/`ConfirmDialog`
primitives, and the inline-409 convention.
Reason: flagged in the step-6 plan per explicit request to distinguish
reused-from-rebuilt. The two axes genuinely can't share one component
without a confusing "which side is fixed" prop, and forcing it would cost
more clarity than the duplication it'd save.

## 2026-07-18 — Cross-navigation: class-teacher-map now carries armId, not just a display label
Decision: `buildClassTeacherMap` (`features/classes/class-teacher-map.ts`)
returns `Map<teacherUserId, { armId, label }[]>` instead of
`Map<teacherUserId, string[]>` — the Teachers list's class-teacher-of
badges are now clickable buttons (`stopPropagation` + `navigate`, since
the row itself is also clickable) linking to `/classes/arms/:armId`, and
`TeacherDetailPage`'s "Class teacher of" entries and "Subjects taught"
class cells link the same way.
Reason: SPEC_V0.2.md §4's explicit cross-navigation requirement — the
badge already had the label, just needed the id threaded through to link
anywhere.

## 2026-07-18 — Confirmed gotcha: `docker compose build` silently reused a stale layer for both api and web
Decision: no code change — a manual-verification-process note. A plain
`docker compose build api web` (no `--no-cache`) produced images that,
when inspected inside the running containers, were missing multiple
files from this step entirely (`ClassesPlaceholderPage.tsx` was still
present; none of the new `features/classes/*` files existed). `GET
/subjects` from the "rebuilt" api container was still returning the
pre-step-6 shape (no `classLevels`), which crashed `SubjectsTab`'s
`row.classLevels.length` with a real, reproducible blank-page error —
not a code bug, confirmed by checking the container's own on-disk source
after the `--no-cache` rebuild fixed it.
Reason: worth knowing before assuming a fresh `docker compose build` is
sufficient evidence of "verified against current code" in this repo —
this session needed a `--no-cache` rebuild of *both* `api` and `web` to
get honest results. Not investigated further (BuildKit cache internals,
out of scope), but the failure mode (stale image reports success,
container silently serves old code) is exactly the kind of thing that
would otherwise produce a false "verified" claim.

## 2026-07-18 — Step 7: History tab hidden from TEACHER entirely (no backend change)
Decision: `GET /audit-logs` is `@Roles(PROPRIETOR, SCHOOL_ADMIN)` only —
TEACHER gets zero audit-log access, matching SPEC_V0.2.md's own RBAC
matrix (§2), which never granted TEACHER visibility either. Rather than
add a TEACHER-readable path to the endpoint, the student detail page's
History tab is simply absent from TEACHER's `tabs` array
(`StudentDetailPage.tsx`), and `useStudentAuditLog`'s query is gated
`enabled: canManage` so it never even fires for TEACHER in the background.
Reason: confirmed with the user via AskUserQuestion before building —
this step's stated scope was explicitly "no backend changes."

## 2026-07-18 — Sibling guardian linking: search the STUDENT, not a guardian endpoint
Decision: no `GET /guardians` (list/search) endpoint exists — only `PATCH
/guardians/:id`. `SiblingGuardianPicker.tsx` searches students by name via
the existing `GET /students?search=`, then lists that student's own
guardians via the existing `GET /students/:id/guardians`, and the user
picks one to link. Reused verbatim in both `AddGuardianDialog` (existing
student, `excludeStudentId` set) and `StudentGuardiansFormSection` (new
student being created, no id yet, `excludeStudentId` omitted).
Reason: confirmed with the user via AskUserQuestion — zero-backend-change
was the explicit constraint for this step, and the original spec's own
Guardians section never called for a dedicated search endpoint either.

## 2026-07-18 — History tab scoped to student-level audit events only
Decision: the History tab renders `GET /audit-logs?entityType=student&
entityId=<id>` results only — `studentGuardian.*` and `guardian.*` actions
are deliberately excluded, even though they're relevant to "this
student's history" in a plain-English sense.
Reason: those rows are logged against the guardian **link's** or the
**guardian's** own id, not the student's id (see the Guardians section of
docs/API.md). Merging them into one student's timeline would require an
N+1 query across every link the student has ever had, including removed
ones — infeasible without a new backend aggregation endpoint, which is
out of scope for a "no backend changes" step. Matches the API's own
documented example literally (`entityType=student&entityId=...` returns
one student's own history, nothing else).

## 2026-07-18 — Fixed a second PROPRIETOR RBAC gap: NewStudentPage's own inline role-gate
Decision: `NewStudentPage.tsx`'s redirect guard excluded `PROPRIETOR`
(`role !== "SCHOOL_ADMIN"`), the same bug class as step 5's
`useCanManageStudents`/`SettingsLayout` gaps — changed to
`!isSchoolAdmin(role)`.
Reason: found in passing while rebuilding the page for the new
guardians[] form section; PROPRIETOR is a strict superset of SCHOOL_ADMIN
everywhere else in this app, so a third instance of this same missed spot
was worth fixing rather than leaving as a known gap.

## 2026-07-18 — zod gotcha: a required `z.enum()` sibling field can silently swallow a `superRefine`'s other errors
Decision: `guardians.ts`'s `relationship` field is `z.union([z.enum(...),
z.literal("")]).optional()`, not a required `z.enum(GUARDIAN_RELATIONSHIPS)`
— and its own requiredness check moved inside the shared
`validateGuardianEntry` superRefine alongside firstName/lastName/phone,
rather than living on the base object schema.
Reason: a native `<select>`'s placeholder option submits `""` through
react-hook-form's uncontrolled `register`, not `undefined`. A required
`z.enum()` rejects `""` as an invalid value, which gives the object an
"aborted" zod parse status — and zod skips a `.superRefine()` entirely
when the base object aborts, silently hiding every other issue in the
same entry (found via a failing vitest assertion: submitting an empty
guardian entry showed only "Select a relationship," not the expected
firstName/lastName/phone errors too, until this fix).

## 2026-07-18 — Fixed: History tab went stale after withdraw/edit/transfer because audit-logs wasn't invalidated
Decision: `useWithdrawStudent`, `useUpdateStudent`, and `useTransferClass`
(`features/students/use-*.ts`) now also call
`queryClient.invalidateQueries({ queryKey: ["audit-logs", "student", id] })`
in `onSuccess`, alongside their existing `["students"]` invalidation.
Reason: found during manual verification (withdraw a student, click
History, expect to see "Student withdrawn" — saw only the older "Student
created" entry). `useStudentAuditLog`'s query fires unconditionally on
page mount (not lazily on tab click), so it had already cached the
pre-withdrawal result by the time the mutation completed; nothing told it
to refetch. The backend was correct throughout (confirmed via direct API
call) — this was a pure frontend cache-staleness bug.

## 2026-07-19 — Step 8 acceptance run found and fixed a real bug: `totalActiveStudents` wasn't session-scoped
Decision: `DashboardService.stats()` now counts `totalActiveStudents` as
`ACTIVE` students with an enrollment in the **current session**
(`enrollments: { some: { sessionId: currentSession.id } }`), matching
`studentsByLevel`'s own scoping — previously it was a school-wide count
ignoring session entirely. `dashboard.e2e-spec.ts` updated to match, plus a
new regression test that creates an empty session, activates it, and
asserts `totalActiveStudents` drops to 0 immediately (cleaning up the
session it creates directly via Prisma afterward, since no `DELETE
/sessions/:id` exists for real usage — see docs/API.md).
Reason: found while manually walking SPEC_V0.2.md §8's acceptance
checklist — activating a freshly-created empty session left the Dashboard
and Students empty-session banner (built in step 7) permanently silent,
because the stat it gates on never reached 0 as long as the school had
*any* active students anywhere. The bug predates v0.2 (the field existed,
unscoped, since v0.1) but only became user-visible once step 7 built a
feature that depended on it being session-scoped.

## 2026-07-19 — Step 8 acceptance run: ClassArmDetailPage's subject-teachers table now collapses to cards on mobile
Decision: `ClassArmDetailPage.tsx`'s subject-teachers list was a plain
`<table>` with no mobile fallback — at 360px, "English Language" and
similar two-word cells wrapped mid-word inside cramped table cells. Added
an `sm:hidden` card list alongside the existing table (now `hidden
sm:block`), matching the mobile-card convention already used by the
`DataTable` component and this same page's own Students section.
Reason: CLAUDE.md §6 requires every table to collapse to cards on mobile;
this one was hand-rolled outside `DataTable` and was missed. Found during
the step 8 polish pass (360/768/1280px review of every v0.2 page).

## 2026-07-19 — Step 8 acceptance run: `academic-setup.e2e-spec.ts` assumed a school has exactly one session
Decision: the suite's `beforeAll` captured "Sunrise's session" via
`academicSession.findFirstOrThrow({ where: { schoolId } })` — no
`isCurrent` filter, no ordering — then `afterAll` restored that same row's
`isCurrent: true` after the suite's own activation test moved the flag
elsewhere. Fixed by filtering `{ schoolId, isCurrent: true }` so it always
captures the actually-current session regardless of how many others exist.
Reason: this session's own manual acceptance-testing created a second,
permanent session for Sunrise (via the real "New session" UI flow — exactly
the feature working as intended), which is what exposed the bug:
`findFirstOrThrow` non-deterministically returned the *other* session,
and `afterAll` then tried to mark it current while the real current
session was already marked current, tripping the one-current-per-school
unique constraint. The test's implicit "exactly one session" assumption
was safe under the original seed but was never going to survive real
usage of a feature whose entire purpose is letting a school accumulate
more sessions over time.

## 2026-07-19 — v0.2 acceptance run: all checklist items PASS
Decision: ran the full SPEC_V0.2.md §8 acceptance checklist (all v0.1
regression items + all v0.2 items) against a fresh `docker compose down -v`
→ migrate → seed stack, via a mix of direct API calls and Playwright
against the real running app (not mocks). Every item passed after the
three fixes above; full e2e (142 tests) + web (60 tests) suites green,
typecheck and lint clean in every workspace, no `any` anywhere in the
codebase.
One cosmetic-only, non-blocking item noted but not fixed: the Subjects
tab's "Levels" column badges wrap one-per-line at exactly 768px (fine at
360px — collapses to a card — and at 1280px — fits on one line); nothing
overflows or is unreadable, just visually tall for subjects offered at
many levels. Left as a known minor polish item rather than risk touching
`DataTable`'s shared column-width behavior this late in the run.
Tagged `v0.2.0` — v0.2 "Staff & Structure" is complete.

## 2026-07-20 — Teachers page (and others) crashed blank in real use: `@scholametric/shared`'s Vite CJS pre-bundle went stale
Confirmed root cause (verified by direct inspection, not assumed): the
crash (`Cannot read properties of undefined (reading 'TEACHER')` in
`TeachersListPage.tsx`'s `JOB_TITLE_LABELS[row.jobTitle]`) traced to
`@scholametric/shared` having no ESM build — only CJS `dist/index.js`
(needed for `apps/api`'s ts-node/Jest consumers). Vite therefore treats it
as a dependency needing CJS interop (`needsInterop: true` in
`node_modules/.vite/deps/_metadata.json`) and rewrites every named import
into a runtime property lookup on the pre-bundled default export —
confirmed directly from the actual transformed module Vite served:
`const JOB_TITLE_LABELS = __vite__cjsImport5__scholametric_shared["JOB_TITLE_LABELS"];`.
That pre-bundle is cached in `node_modules/.vite/deps` and is invalidated
by Vite based on the **lockfile/config hash**, not by `packages/shared`'s
own source or dist changing — so a plain container restart or rebuild
around the same time `packages/shared` changes doesn't reliably bust it,
matching this repo's own prior "Vite dep cache goes stale" entry above
(2026-07-14) and the "docker compose build reused a stale layer" entry
(2026-07-18) — same underlying class of bug, this time hitting an actual
export at runtime instead of a whole missing file.
Structural fix (per explicit instruction — not just a note this time):
`apps/web/vite.config.ts` now aliases `@scholametric/shared` straight to
`packages/shared/src/index.ts` (its real TS source) via `resolve.alias`,
and excludes it from `optimizeDeps` entirely. Vite transforms it exactly
like first-party app source from here on — real ESM, transformed fresh
per request, invalidated by Vite's own file watcher like any other `src`
file. No CJS interop, no separate dependency-pre-bundle cache to go stale,
ever again, for this package. `apps/api` is untouched (still consumes the
CJS `dist` build via its own `main` field resolution — this fix is
Vite-config-only).

## 2026-07-20 — Why step 8's acceptance run marked Teachers PASS despite this crash being real
Finding: every Playwright check in step 8 (and its own polish pass)
launched a **brand-new browser context** immediately after a Docker image
finished (re)building — by construction, that can never observe a bundle
that's stale *relative to a build that already completed*, only a bundle
that's stale *relative to source the current build doesn't yet reflect*.
The gap this crash fell through is different: a **already-open, long-lived
browser tab** (or a page load that raced a container restart's cold-start
re-optimization) can hold — or fetch — a `@scholametric/shared` pre-bundle
that's inconsistent with what the currently-running server would produce
fresh, even though a brand-new tab loaded after the fact sees the correct
state. This is exactly what happened in this session's own history: step
8 rebuilt/restarted the web container several times in quick succession
(full `--no-cache`, then an incremental `docker compose build web` for the
`ClassArmDetailPage` fix, then an unplanned restart after Docker Desktop
itself crashed) while real manual use was happening in parallel. A fresh
Playwright context launched *after* each of those settled never had a
chance to inherit a stale module graph the way a persistent tab could.
Conclusion: "verified with a fresh browser right after the build finished"
is not equivalent to "verified the way a developer actually uses the app
during active development" — the latter needs either (a) the structural
fix above (removing the staleness-prone cache entirely, done), or (b) a
verification step that specifically holds a tab open across a rebuild,
which step 8's checklist never called for and the acceptance criteria
didn't ask for either. Added the route-smoke test below as a durable,
CI-enforced backstop for the broader "a route crashes blank" failure mode
this incident is one instance of — though note it runs under Vitest/Node,
where CJS/ESM interop is transparent (see the 2026-07-14 entry), so it
cannot itself reproduce *this specific* browser-only caching bug; it
guards the general class (a real code defect crashing a route), while the
`vite.config.ts` alias guards this specific one.

## 2026-07-20 — Route-level error boundary + a smoke test that mounts every registered route
Decision: `App.tsx`'s `<Routes>` tree is now extracted into an exported
`AppRoutes` component (still just wrapped in `<BrowserRouter>` by `App`),
so a new `route-smoke.test.tsx` can mount the *exact* same route
definitions inside a `<MemoryRouter>` — one route list, not a second
hand-copied one that could silently drift out of sync. `ProtectedLayout`
now wraps its `<Outlet />` in a new `RouteErrorBoundary` (class component;
no hook equivalent exists in React 18), keyed on `location.pathname` so
navigating away from a crashed route recovers automatically rather than
staying stuck — a crash now renders a friendly "Something went wrong" box
with Try again/Reload, never a blank white page, with the sidebar/shell
still intact and usable around it.
Reason: the Teachers crash above reached a real user as a totally blank
page with no way to recover short of knowing to reload — exactly the
failure mode CLAUDE.md §6 already requires every data view to avoid
("Loading, empty, and error states are required... A page that only
handles the happy path is incomplete"), just extended to the render-crash
case a query-level `isError` check can't catch. The smoke test mounts
every route (`/dashboard`, `/students`, `/students/new`, `/students/:id`,
`/teachers`, `/teachers/:id`, `/classes`, `/classes/arms/:id`,
`/personnel`, `/settings/school`, `/settings/academic`) with mocked
auth/API and asserts the error boundary's fallback text never appears —
so a future page that crashes on real (non-empty) row data fails CI
immediately, rather than only surfacing in manual use like this one did.

## 2026-07-20 — Confirmed gotcha: `pnpm ci` at the repo root is pnpm's own reserved command, not this repo's script
Decision: no code change — an operational note. Running `pnpm ci` from the
repo root silently ran pnpm's own built-in clean-install behavior (removes
and reinstalls every workspace's `node_modules`) instead of this repo's
`package.json` script of the same name (`typecheck && lint && test`); it
exits 0 having done nothing but reinstall. `pnpm run ci` (with the explicit
`run`) invokes the actual script. Separately, the root `test` script
(`pnpm -r --if-present run test`) runs `apps/api` and `apps/web` **in
parallel** by default (no dependency relationship forcing order) — under
load, that starved the API suite's bcrypt-cost-12 login hooks past their
5s Jest timeout (`schools-crud.e2e-spec.ts`, 10 tests, all the identical
"Exceeded timeout of 5000ms for a hook" during `beforeAll`'s `loginAs`),
while the exact same suite passed 142/142 clean in isolation seconds
later. Not a real regression — confirmed by re-running each workspace's
suite separately.
Reason: worth knowing before trusting a root `pnpm ci`/`pnpm test` run's
result at face value in this repo — use `pnpm run ci` (not bare `pnpm
ci`), and if the API suite fails only under the combined root run, rerun
it alone before treating a failure as real.

## 2026-07-20 — Dashboard chart "0" Y-axis ticks: real cause was label clipping, not fractional-tick rounding
Decision: the reported bug ("every Y-axis tick label reads 0") was
diagnosed on report as recharts' classic fractional-tick-rounding issue
on small integer domains — but `allowDecimals={false}` was already set
on the YAxis and had been since this chart was first built; that wasn't
it. Confirmed the real mechanism by dumping the live SVG: the DOM's tick
`textContent` was always correct (`0`, `30`, `60`, `90`, `120`) — the
*rendered pixels* were wrong. `BarChart`'s `margin={{ left: -16 }}`
combined with the Y-axis's right-aligned (`text-anchor="end"`) labels
pushed any 2+ digit label's left edge into negative SVG-coordinate space,
which recharts' `overflow: hidden` SVG then clipped — leaving only the
last digit(s) visible. Every affected value here (0, 30, 60, 90, 120)
happens to end in the digit "0", which is why the symptom looked like
uniform zeros rather than obviously-truncated numbers. Single-digit
domains (e.g. max=3 → ticks 0–4) were never wide enough to clip, which is
why this had gone unnoticed until a level's count crossed into double
digits.
Fix: `margin.left` changed from `-16` to `0` (removing the clipping),
plus a new `computeIntegerTicks()` (`chart-ticks.ts`) that computes the
Y-axis's domain max and evenly-spaced integer ticks explicitly, replacing
reliance on recharts' own auto-fit "nice tick" algorithm — passed via the
YAxis's `domain`/`ticks` props with `interval={0}` (forces every provided
tick to render; without it, recharts' own overlap-avoidance filtering
silently drops most of them under jsdom's fake text metrics — this was
also what made the DashboardPage test hang at "1 tick rendered" until
`interval={0}` was added, since explicit `ticks` alone doesn't bypass
that filtering).
Reason: confirmed root cause by direct SVG/DOM inspection (bounding
boxes, raw attribute dump) before changing anything, rather than
implementing the reported hypothesis on faith — same discipline as the
Teachers-crash fix above. Explicit computed ticks were chosen over "just
fix the margin" alone because it also makes the axis's tick count and
spacing deterministic and unit-testable (`chart-ticks.test.ts`), rather
than depending on recharts' internal fitting heuristics staying stable.

## 2026-07-21 — SPEC_V0.3.md review: resolutions (recorded before any build work)
Ten open questions from the pre-build spec review were resolved and the
spec edited inline to match (docs/SPEC_V0.3.md §§1-2, 4-8). No code
changed — this is a planning-stage record.

1. **`POST /auth/change-password` does not revoke other sessions in
   v0.3.** Just verifies the current password, sets the new one, clears
   `mustChangePassword`. Reason: the schema has no session/family
   concept to distinguish "the caller's own session" from "others" (a
   `refresh_tokens` row is keyed only by `userId` — see the existing
   code comment in `auth.service.ts`'s `refresh()` explaining the same
   gap for reuse-detection). Revoking every OTHER session requires that
   concept to exist first; carried as an explicit future item in
   SPEC_V0.3.md §6, not built now.
2. **`PASSWORD_CHANGE_REQUIRED` ships as a response header, not an
   envelope field.** The blocked-endpoint guard returns `403` with the
   existing, unchanged error envelope (`{statusCode, message, error,
   path, timestamp}`, per CLAUDE.md §5) plus
   `X-Password-Change-Required: true`. The frontend also reads
   `mustChangePassword` directly off `GET /auth/me`, so the header is a
   secondary/defensive signal, not the only one. Reason: adding a `code`
   field to the shared envelope would be a global contract change
   affecting every error response in the API, not just this guard —
   avoided entirely by using a header instead.
3. **CLAUDE.md §5's "all list endpoints are paginated" gets a one-line
   exception** for bounded, fully-returned config-style endpoints:
   `GET /assessment-components` (≤8), `GET /grade-boundaries` (≤12),
   `GET /grading-presets` (exactly 2, static), `GET /me/teaching`
   (bounded by the caller's own assignments). Recorded as a
   pre-approved constitution amendment in SPEC_V0.3.md §5, same
   treatment as the CI amendment.
4. **`GET /me/teaching` is its own endpoint**, reusing
   `TeachersService`'s existing class-teacher/subject-teacher join
   logic (already TEACHER-readable via `GET /teachers/:userId`) plus a
   new current-session enrollment-count join. Reason: extending the
   shared `ClassTeacherOfEntry` type with `enrollmentCount` would also
   change what admins see at `GET /teachers/:userId` as a side effect;
   a separate endpoint keeps that response shape untouched while
   reusing the underlying query logic.
5. **`mustChangePassword` is returned by `GET /auth/me` as well as
   login.** Reason: the flag can become true mid-session (an admin
   resets someone else's password while they're already logged in), so
   the frontend can't rely solely on the login response to catch it —
   it needs to be checked on every load.
6. **No deep-link memory through the forced password-change flow in
   v0.3.** After changing, always redirect to home (dashboard/My
   Classes), never back to a pre-login deep link. Reason: the app has
   zero "remember where I was going" infrastructure today (confirmed —
   login always hard-navigates to `/dashboard`); building a 3-hop
   redirect chain (deep link → login → change-password → destination)
   is real, undesigned work, not a one-line addition. Carried as a
   deferred item in SPEC_V0.3.md §6.
7. **TEACHER gets READ access to `GET /grade-boundaries` in v0.3**
   (write stays PROPRIETOR/SCHOOL_ADMIN-only). Reason: v0.4's score
   entry will need teachers to see the grading scale they're entering
   scores against; no reason to gate read access now just to reopen it
   next version. `GET /assessment-components` and `GET
   /grading-presets` stay fully admin-only (no teacher-facing need for
   either yet).
8. **`assessment_components.deleted_at` is reserved, not wired, in
   v0.3.** Column exists (so the migration shape doesn't change again
   in v0.4), but nothing reads or writes it, and `UNIQUE(school_id,
   name)` stays a plain (non-partial) index. `PUT
   /assessment-components`'s full-set replace is a hard
   delete-and-recreate in v0.3. Reason: nothing in v0.3 can reference a
   component (no scores exist yet), so soft-delete semantics would sit
   completely unused; turning it on — and migrating the unique index to
   partial (`WHERE deleted_at IS NULL`) — is v0.4's job, once scores
   actually need the protection.
9. **CI must not run the root `pnpm test` (or bare `pnpm ci`) as a
   single step**, and must raise Jest's hook/test timeout for the API
   e2e suite. Reason: proven this week, not hypothetical — the root
   `pnpm test` runs `apps/api` and `apps/web` concurrently via pnpm's
   default recursive workspace concurrency, and that contention starved
   a bcrypt-cost-12 login hook past Jest's default 5s timeout locally
   (`schools-crud.e2e-spec.ts`, 10 tests, all failing the same way in
   `beforeAll`) — the identical suite passed 142/142 clean in isolation
   seconds later. GitHub's standard runners are typically more
   resource-constrained than a dev machine, not less, so this risk is
   real for "must pass on the first real push." Fix (recorded in
   SPEC_V0.3.md §5, to build in v0.3 step 3): run the API and web test
   suites as separate sequential CI steps, and raise the API e2e
   timeout. Also noted: bare `pnpm ci` is pnpm's own reserved
   clean-install command, not this repo's script (already learned the
   hard way during v0.2 step 8) — the workflow must use `pnpm run ci`
   or the separated steps, never bare `pnpm ci`.
10. **"WAEC 9-point preset" does not touch CLAUDE.md §9's "WAEC/NECO
    integration" out-of-scope line.** It's a static, locally-stored
    percentage→grade lookup table the school can apply with one click —
    no external WAEC/NECO system, API, or result submission is
    involved. Noted explicitly in SPEC_V0.3.md rather than left to a
    reviewer's assumption, since the term appears in both documents.

## 2026-07-21 — v0.3 step 1: assessment schema + seed + /users removal
Decision: added `assessment_components`/`grade_boundaries` tables and
`users.must_change_password` (additive), seeded both schools' WAEC
9-point boundaries and CA1/CA2/Exam components, seeded
`newteacher@sunrise.test` (TEACHER, `must_change_password: true`), and
deleted the entire deprecated `/users` controller/service/module/DTOs
(all four routes now 404). Proved: seed is idempotent (identical row
counts across two runs), each school's components sum to exactly 100,
each school's boundaries tile 0-100 with no gaps/overlaps (window-
function check, not just eyeballing the rows), `newteacher@sunrise.test`
has the flag true while pre-existing users default false, and all four
removed routes 404 live. Full e2e (132 tests, down from 142 — the old
`users.e2e-spec.ts`'s ~10 CRUD-behavior tests were replaced with 4
"route is gone" tests) + web (79) green, typecheck/lint clean
everywhere.

Two new gotchas found and worth carrying forward:
- **`prisma migrate dev` (no flag) hangs non-interactively after
  applying, because it also runs a post-apply drift check** — and this
  repo's hand-maintained trigram indexes (see the 2026-07-12 entry
  above) are invisible to Prisma's schema model, so it always looks
  like drift and prompts for a new migration name. With stdin closed
  (as under this tool's Bash), that prompt hangs forever with 0% CPU,
  not a visible error. `prisma migrate status` confirms the actual
  migration was already applied cleanly regardless — the hang is purely
  the CLI's own follow-up drift-reconciliation prompt, safe to kill.
  **Use `prisma migrate deploy` to apply an already-created migration
  non-interactively** (what `--create-only` migrations should be applied
  with from now on in this repo) instead of bare `prisma migrate dev`.
- **`staff_profiles` has a real `UNIQUE(school_id, staff_number)`
  constraint** — a hardcoded "next sequential number" for a new seed
  fixture collided with leftover manual-testing residue in this
  long-lived dev database (`newteacher.NNNNNN@sunrise.test` rows at
  `SUN/STF/0011-0013` from v0.2 step 7/8's own acceptance testing).
  Fixed by giving `newteacher@sunrise.test` a deliberately
  out-of-sequence staff number (99) instead of the next slot. Worth
  remembering before assuming a fresh sequential number is safe against
  a dev database that already has real usage history, not just a
  from-scratch seed.

Also removed the `personnel.e2e-spec.ts` test that exercised the now-gone
`POST /users/:id/reset-password` alias directly — rewritten to hit
`POST /personnel/:userId/reset-password` instead (the underlying
"works for a user with no staff profile" case it was actually testing
still matters; only the removed route it went through changed).

## 2026-07-21 — v0.3 step 2: teaching view + grading config + forced password change
Decision: built `GET /me/teaching`, `GET`/`PUT /assessment-components`,
`GET`/`PUT /grade-boundaries`, `GET /grading-presets`, and `POST
/auth/change-password` + its guard. No schema changes — step 1 already
added everything needed. Several implementation choices worth recording:

**`mustChangePassword` guard composition.** Embedded as a claim in the
access token itself (`AccessTokenPayload.mustChangePassword`), copied into
`request.user` by `JwtAuthGuard` exactly like `role`/`schoolId` already
are — zero extra DB hit per request, matching that guard's own existing
"stateless access token" design (its own comment already accepts
disabled/deleted-user staleness the same way). A new
`PasswordChangeRequiredGuard` is registered in `APP_GUARD` right after
`JwtAuthGuard` — before `AppThrottlerGuard`/`RolesGuard`, so a flagged
user is blocked regardless of role or rate-limit state. It reads
`request.user.mustChangePassword`; if `request.user` is undefined (a
`@Public()` route — login/refresh/health), it no-ops, so it never needs
to know about `@Public()` itself. A new `@AllowWhilePasswordChangeRequired()`
decorator (mirrors `@Public()`'s `SetMetadata`/`Reflector` pattern exactly)
exempts `GET /auth/me`, `POST /auth/logout`, and `POST
/auth/change-password`.
Reason: because the claim is JWT-sourced, it can go stale for up to the
access token's remaining lifetime if something ELSE flips it after the
token was issued (an admin resetting a *different* user's password mid-
session) — an accepted tradeoff, not a bug, matching `JwtAuthGuard`'s own
precedent. `GET /auth/me` is unaffected regardless (its own DB read is
always fresh), so the frontend's primary signal (SPEC_V0.3.md resolution
5) stays accurate; the guard is a defensive backstop, not the sole
enforcement.

**`POST /auth/change-password` reissues a fresh token pair.** Not asked
for explicitly in the spec text, but necessary given the design above:
without it, the caller's own still-valid access token would keep the
stale `mustChangePassword: true` claim and the guard would keep blocking
them even after a successful change, for up to 15 minutes. This doesn't
conflict with resolution 1 ("no other-session revocation") — it's a new
token for the *same* caller, not a revocation of anyone else's sessions.

**Three mutations bypass the standard `@Audit()`/`AuditInterceptor`,
written manually instead.** `AuditInterceptor` reads `entityId` off the
response body's `.id` field and logs `request.body` verbatim as
`metadata`. Neither fits: `PUT /assessment-components` and `PUT
/grade-boundaries` return an *array* (no single `.id` — using the
school's own id as `entityId` instead, since there's no single row to
key off for a whole-set replace), and `POST /auth/change-password`'s
body literally contains both passwords (logged as `{}` instead — no
password material in the audit log, per spec). All three are still
audited, just not through the decorator.

**Array-body PUTs are wrapped, not bare.** SPEC_V0.3.md §2's shorthand
(`[{name, weight, sortOrder}]`) reads as a bare-array request body, but
both PUTs actually take `{ components: [...] }` / `{ boundaries: [...] }`
— matching this API's own existing convention for array-body mutations
(`PUT /subjects/:id/levels` takes `{ classLevelIds }`, not a bare array).
A bare array would also need `ParseArrayPipe` instead of the standard
global `ValidationPipe`, fighting the framework for no real benefit here.

**`GET /assessment-components` stayed fully admin-only** (unlike `GET
/grade-boundaries`, which resolution 7 opened to TEACHER) — nothing in
v0.3 or the near-term v0.4 score-entry plan gives a teacher a reason to
see the school's CA/Exam weighting, only the grade scale they'll be
scoring against.

**"Simple A-F preset" bands**, unspecified by the spec beyond the name:
A 70-100 Excellent, B 60-69 Very Good, C 50-59 Good, D 45-49 Pass, F
0-44 Fail — 5 bands, tiles 0-100 cleanly, a plausible simpler alternative
to the WAEC 9-point scale for a school that wants one.

E2e proves: `/me/teaching` returns real data for `teacher@sunrise.test`
(their actual seeded class-teacher/subject assignments) and empty arrays
(not an error) for `admin@sunrise.test` (no assignments); assessment-
components PUT rejects 90-total and 110-total sets, atomically (GET
confirms the prior set survives untouched after each rejection), and
accepts a valid 100-total replacement; grade-boundaries PUT rejects a
gap (missing 45-49) and an overlap, and accepts the WAEC set; presets
returns both tables; login and `/auth/me` both expose the flag;
change-password rejects a wrong current password and a sub-8-character
new one, then on success clears the flag (confirmed via a fresh
`/auth/me` call using the reissued token) and immediately unblocks a
previously-403'd endpoint; the guard 403s a flagged user everywhere
except the three allowed routes and sends the header; TEACHER can read
grade-boundaries but gets 403 on both PUTs; cross-tenant is proven on
every mutating endpoint (one school's PUT never changes another's set).
167 e2e tests total, typecheck/lint clean.

## 2026-07-22 — v0.3 step 3: GitHub Actions CI
Decision: `.github/workflows/ci.yml` runs Postgres 16 and Redis 7 as GH
Actions *service containers* (not docker-compose — that's dev/prod
tooling, out of scope here), port-mapped straight to their native
5432/6379 on the runner. DATABASE_URL/REDIS_URL and two throwaway JWT
secrets are set as job-level env vars, read directly by `prisma migrate
deploy`, `pnpm seed`, and the app under test — no secrets store needed
since the DB is destroyed with the runner.

`apps/api`'s `test` script already ran `jest --runInBand`, so e2e
execution was already serial. The one real gap: `jest-e2e.json` had no
`testTimeout` (Jest default 5000ms), and some spec files do up to 5
sequential bcrypt-cost-12 logins in one `beforeAll` — fine locally, risky
on a shared CI runner. Added `"testTimeout": 30000`.

Gotcha for future reference, discovered on the first real run (not
locally reproducible without a matching Node version): `pnpm@11.12.0`
(this repo's pinned `packageManager`) requires Node >=22.13 to run at
all — `actions/setup-node` with `node-version: "20"` crashed *during
its own cache-detection step* (`pnpm store path`) with `Error
[ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite`,
before any of our steps even ran. Switched CI to Node 22, matching the
API Dockerfile's `node:22-alpine` base (engines still says `>=20`, so
this isn't a spec violation, just a pnpm-version floor).

Also: `pnpm/action-setup` must run *before*
`actions/setup-node`'s `cache: pnpm` step — the cache step shells out to
`pnpm store path`, which fails if pnpm isn't on PATH yet. Also: the
literal command in the workflow is `pnpm run ci`, never bare `pnpm ci` —
the latter is pnpm's own reserved clean-install command and silently
does something else entirely. Fixed a pre-existing README table row that
had this exact mistake while touching that section.

Second gotcha, found on the run after the Node fix: `apps/api`/`apps/web`
typecheck failed with "Could not find a declaration file for module
'@scholametric/shared'" even though the build-shared step itself
reported success. Root cause, reproduced locally via a genuinely fresh
`git clone`: `packages/shared/tsconfig.tsbuildinfo` (TypeScript's
incremental-build cache, produced because the package's tsconfig sets
`composite: true`) was committed to git back in the initial scaffold
commit, while `dist/` itself is correctly gitignored. On a fresh clone,
`dist/` starts empty but the stale, committed `tsbuildinfo` still
records most source files as "already built" — so `tsc` silently skips
re-emitting their `.d.ts` (a partial, confusing failure: some files
like `classes.d.ts` DID emit, most others didn't, depending on what the
stale cache remembered). This was invisible locally because no one had
done a truly clean clone+install before — every local run incrementally
rebuilt against an already-populated `dist/`. Fixed by adding
`*.tsbuildinfo` to `.gitignore` and `git rm --cached` on the tracked
file — not a workflow-file change at all, a real repo hygiene bug that
CI's clean-checkout model exposed. The earlier explicit "Build shared
package" CI step is kept regardless — deterministic and harmless.

CI badge added to README, pointed at `damiaig/scholametric`'s Actions
tab. First real run watched to green before considering this step done
(see commit history / Actions tab for the run, not reproduced here).

## 2026-07-27 — v0.3 step 4: teacher home + forced password change (frontend)
Decision: the forced-password-change guard lives in `ProtectedLayout`
(loading-aware — spinner while `useCurrentUser()` resolves, then redirect
to `/change-password` if `mustChangePassword`), the exact same pattern
`RequireSchoolAdmin` already used for role-gating. A new `ChangePasswordRoute`
mirrors `LoginRoute` (unauthenticated → `/login`, not-flagged → `/dashboard`,
loading-aware in between). `LoginRoute` itself was deliberately NOT given its
own duplicate `mustChangePassword` check — `ProtectedLayout`'s gate already
catches the rare "visit /login while authenticated and still flagged" case
before any real content renders, so a second check there would be pure
redundancy.

`useChangePassword` swaps tokens immediately via `authStore.setTokens()` on
success (the caller's OWN pre-existing access token still carries the stale
`mustChangePassword:true` claim — see step 2's decision) and invalidates the
`["auth","me"]` query so the guard clears without waiting on the token's
natural expiry. `LoginPage` navigates directly off the login response's own
`mustChangePassword` (zero extra round trip) rather than letting `LoginRoute`
re-derive the same thing from a fresh `/auth/me` fetch.

`DashboardPage` splits on `role === "TEACHER"` at the top; the existing admin
body was extracted verbatim into `AdminDashboard()` — zero behavioral diff
for SCHOOL_ADMIN/PROPRIETOR, confirmed both by the pre-existing test suite
passing unmodified and by a live screenshot. `GET /me/teaching` is bounded/
unpaginated per the backend's own design (step 2), so `MyClassesView` needs
no pagination UI.

Gotcha: `AppShell.test.tsx`'s existing TEACHER sidebar test matched nav
links via a loose regex (`/Classes/`), which — once the Dashboard item's
label became "My Classes" for TEACHER — ambiguously matched BOTH "My
Classes" and "Classes", throwing a "multiple elements found" error. Fixed
by switching to exact-string role queries; a good reminder that loose
regex matchers in tests are landmines for future copy changes.

New shared types (`packages/shared`): `mustChangePassword` added to
`AuthUserSummary`/`CurrentUser` (auth.ts, matching what the API already
returns since step 2); new `me.ts` for `GET /me/teaching`'s response shape;
`changePasswordSchema`/`ChangePasswordInput` in auth.ts. Reused the existing
`RefreshResponse` type for `POST /auth/change-password`'s response — same
`{accessToken, refreshToken}` shape, no new type needed.

No backend/API changes this step (frontend-only, as scoped) — confirmed
before starting that every endpoint this step needed already existed from
step 2.

**Manual verification (Playwright against the real Docker stack, not just
mocked tests)**: `teacher@sunrise.test` lands on My Classes showing the
real seeded assignments (SSS 2 A / JSS 1 A as class teacher, Mathematics
across 4 arms) and a class-card click navigates to that arm's page.
`newteacher@sunrise.test` (flagged) is forced to `/change-password`;
attempting an in-SPA client-side navigation to `/students` (pushState +
popstate — what a real `<Link>` click does, as opposed to a hard reload,
which this app's deliberately memory-only auth store treats as a fresh
logout regardless of any flag) bounces straight back to
`/change-password` with no flash of Students content; changing the
password lands on My Classes directly; logging out and back in with the
NEW password is fully normal, no longer forced. `admin@sunrise.test`'s
dashboard (stat cards + chart) is pixel-identical to before. All of the
above confirmed again at a 360px viewport, including the mobile nav
drawer showing the correct label per role. `newteacher@sunrise.test`'s
password/flag restored to the exact seed state afterward (bcrypt hash of
`Passw0rd!` at cost 12, `mustChangePassword:true`, stale refresh tokens
revoked) — same restore shape as the backend e2e suite's own `afterAll`.

Environment note, not a repo issue: local verification found port 3000
already bound by an unrelated `next-server` process on this machine —
docker-compose's `API_PORT` override (`API_PORT=3001 docker compose up
-d`) was used for this session's verification only; `docker-compose.yml`
itself is untouched and still defaults to 3000.

## 2026-07-30 — v0.3 step 5: grading config admin panels (frontend)
Decision: cross-item validation (weights summing to exactly 100, unique
names; grade boundaries tiling 0-100 with no gaps/overlaps, unique
grades) lives in a new `packages/shared/src/grading-config.ts` as plain,
framework-free functions (`validateAssessmentComponentsSet`,
`validateGradeBoundariesSet`) — a deliberate MIRROR of the backend's
class-validator/service rules (step 2), not a single shared source. The
two sides use different validation paradigms by design (CLAUDE.md §6:
Zod on the frontend, class-validator on the API) and there's no
compiler/test link enforcing they stay in sync — only this comment and
the fact that both were written by reading the same backend service
files line-by-line. If the backend's rules ever change, this file needs
a matching update. `validateGradeBoundariesSet` takes a `keyOf` callback
so the frontend can highlight the exact offending rows without relying
on array index (which shifts on add/remove/reorder).

Real bug found and fixed during manual verification: `react-hook-form`'s
`register()` returns the RAW STRING from the DOM for number inputs
unless `valueAsNumber: true` is passed. `useWatch` reads that raw form
state directly — it does NOT go through zod's `coerce.number()`, which
only runs at resolver-validation time. Without `valueAsNumber: true`,
typing "50" into the Exam weight field made the live total silently
compute as 40 (20+20+0), since `Number.isFinite("50")` is `false` and
the shared validator's NaN-guard treated the string as 0. Fixed by
adding `valueAsNumber: true` to every numeric-field `register()` call in
both new panels. Caught only by actually driving the browser — the
per-field zod validation still passed fine (coercion IS applied at
submit time), so this would NOT have been caught by a submit-only test.

Preset buttons use `useFieldArray`'s `replace()`, not the form's own
`reset()`, to fill rows — `reset()` would also reset react-hook-form's
internal "dirty" baseline to the just-applied preset, which would
incorrectly (a) hide the Save button (nothing looks "changed") and (b)
make "Discard changes" revert to the preset instead of the actual
server-persisted set. `replace()` swaps only the current values, leaving
the original loaded baseline intact for both purposes.

Subjects tab polish debt (SPEC_V0.3.md §4 item 5): at exactly 768px (the
sidebar's own `md` breakpoint, so the least horizontal room the table
view ever gets), the Levels column's `flex flex-wrap` chip list
collapsed to one chip per line — auto-layout tables size a flex-wrap
cell to its narrowest child's width during column-width calculation, not
its wrapped/preferred width, even though the row had plenty of unused
space beside it. Fixed with `min-w-[125px] px-2` on that column (gives
the flex-wrap container a real width to wrap 2 chips/row against) plus
tightening the actions column's own gap/padding (`gap-1`, `px-2`) to
reclaim just enough room that the table needs zero horizontal scroll at
768px — confirmed via exact pixel measurement (`scrollWidth` vs
`clientWidth`) rather than eyeballing, since an earlier wider attempt
"fixed" the wrapping but silently pushed 2 of 3 row-action buttons
off-screen, which would have been an easy miss on a screenshot alone
without checking horizontal scroll. No regression at 1280px (confirmed).

Manual verification method note: iterated on both the panels and the
768px CSS fix against a local `pnpm --filter web exec vite --port 5173`
dev server (with the Docker `web` container stopped to free the port)
talking to the real Docker `api`/`postgres`/`redis` — this bypasses the
~3-5 minute no-volume-mount Docker image rebuild for every CSS/JS
tweak, which would have been the dominant cost of this step otherwise.
The Docker `web` image was rebuilt and the full manual-verification
checklist re-run against it once complete, matching this session's
established "prove it against the real running Docker stack" convention
for the final, reported verification.

**Manual verification (Playwright)**: Assessment structure — changing
Exam to 50 turns the total red ("currently 90") and disables Save;
changing a genuinely different valid combination (CA2 25 / Exam 55 = 100)
enables Save and persists via `PUT /assessment-components` with the
exact expected payload. Grading scale — deleting the 45-49 (D7) row
highlights the two bordering rows (C6, E8) red with "There's a gap
between 44 and 50."; Apply A-F (behind its ConfirmDialog) fills rows and
saves; reloading confirms persistence; re-applying WAEC 9-point restores
the seeded set. TEACHER sees neither panel (confirmed both by rendering
`AcademicSettingsPage` directly with a TEACHER fixture, and by the
existing outer `SettingsLayout` route guard, which already excludes
non-admins from `/settings/*` entirely — the panels' own
`isSchoolAdmin()` check is defense-in-depth, per the task's explicit
instruction to use it, not the only gate). 768px chip fix and 360px pass
both confirmed. All seeded values (assessment components, WAEC grade
boundaries) restored to their exact seed state afterward.

## 2026-07-30 — chore: pnpm 11.12.0 (broken) → 11.18.0
Decision: `pnpm@11.12.0` — pinned in root `package.json#packageManager`
and both Dockerfiles' `corepack prepare` lines since the project's
initial scaffold — turns out to ship a broken `@pnpm/exe` on at least
this machine's platform (Apple Silicon): a from-scratch install fails
outright, which would have broken the very next CI run (CI always does
a fresh `pnpm install --frozen-lockfile` on a clean runner, no cached
`node_modules` to fall back on). Root `package.json` had already been
bumped to `11.18.0` by the time this was caught; this change brings
every remaining pin in sync: `apps/api/Dockerfile`, `apps/web/Dockerfile`
(both `corepack prepare pnpm@...`), and the CI workflow's explanatory
comment (`.github/workflows/ci.yml` — the workflow itself never
hardcodes a pnpm version; `pnpm/action-setup` reads it from
`packageManager` automatically, so only the comment needed updating).

Not touched: the OLDER `11.12.0` mention inside this file's own
2026-07-22 CI entry, above — that's a historical record of what was true
at the time and this log is append-only (CLAUDE.md §3); this entry is
the correction, not a rewrite of that one.

Verified: `rm -rf node_modules **/node_modules && pnpm install
--frozen-lockfile` succeeds cleanly under `pnpm@11.18.0`; `pnpm
typecheck` passes; `docker compose build --no-cache api web` (forcing
the Dockerfiles' `corepack prepare` line to actually re-run rather than
reuse a cached layer) succeeds for both images.

## 2026-07-30 — v0.3 step 6: acceptance run + polish — v0.3 complete
Decision/summary: ran the full SPEC_V0.1/V0.2/V0.3 acceptance checklists
(29 items total) against a genuinely fresh stack (`docker compose down
-v` → build → up → migrate → seed), via a mix of direct API curl checks
and live Playwright walkthroughs of the real running stack. Every item
passed — see the commit message / conversation for the itemized
PASS list; not duplicated here.

Rate-limit test (`auth-rate-limit.e2e-spec.ts`), flagged twice before as
"environmental": root-caused, not just re-flagged. `auth.service.ts`'s
`login()` deliberately runs a real bcrypt-cost-12 compare even for a
nonexistent user (against a dummy hash) so response timing can't leak
which part of a bad credential was wrong — correct, load-bearing
security behavior, left untouched. The test's own hardcoded 20000ms
timeout was the actual failure mode (confirmed: a prior failure hit
exactly 20007ms). Attempted genuine reproduction under both a raw CPU
busy-loop (4× `yes`) and a real concurrent `docker compose build
--no-cache` — neither reproduced meaningful slowdown (test stayed at
~1.7-1.9s in both cases); 8 consecutive clean runs afterward. Raised the
test's own timeout to 45000ms — comfortably under the login throttle's
own 60000ms TTL window (`AuthController`'s
`@Throttle({default:{limit:10,ttl:60000}})`), which is the real ceiling
this test needs to stay inside for its own assertions to remain
meaningful, rather than an arbitrary larger number.

Polish fix: `GradingScalePanel`'s Remark field truncated longer values
("Excellent" → "Exceller", "Very Good" → "Very Go") at exactly 768px —
the row's `sm:flex-wrap` left Remark sharing a line with Grade/Min/Max,
leaving too little width for longer words. Fixed with
`max-lg:basis-full` (Tailwind's built-in max-width variant, available
since 3.2) so Remark forces its own full-width row only below the `lg`
(1024px) breakpoint — confirmed clean at 768px, at the 1024px boundary
itself, and unchanged at 1280px (three separate screenshots, not just
eyeballed). `AssessmentStructurePanel`'s equivalent Name field wasn't
affected — that row has no `sm:flex-wrap` (only 3 fields, always fits
on one line) and its typical values (CA1, Exam) are short.

Regression discovered and fixed mid-run (not a product bug — my own
test-data pollution): walking the v0.2 class-teacher reassignment check
left JSS 1 A's class teacher pointing at a throwaway test account
instead of the seeded `teacher@sunrise.test`, which then made the v0.3
"My Classes" polish screenshot look like a real data bug (only one
class-teacher card instead of two) until traced back to my own earlier
test action. Restored via the UI (not a DB hack) to keep the fix
provably going through the real assign flow. Also restored
`teacher@sunrise.test` and `newteacher@sunrise.test`'s passwords/
`mustChangePassword` flags to exact seed values after exercising the
reset-password and forced-change-password flows on them.

No backend/schema changes this step (verification + polish only, per
scope). `docs/API.md` unchanged — no endpoint behavior changed.

## 2026-08-11 — v0.4 step 1: grades schema + seed
Decision: added `student_scores`, `term_subject_results`,
`term_overall_results` (all school_id-scoped per CLAUDE.md §4, exactly
per SPEC_V0.4.md §1) and `assessment_components.requires_approval`/
`max_score`. Wired the soft-delete resolution from the pre-step-1 spec
review (resolution 8's "v0.4's job"): `PUT /assessment-components` now
matches incoming items to existing rows by `id` (new optional DTO
field) and only removes what's unmatched — soft-deleting a removed
component if any `student_scores` row references it (FK is `ON DELETE
RESTRICT`), hard-deleting it otherwise (matching pre-v0.4 behavior for
untouched components). `@@unique([school_id, name])` became a
hand-written partial index (`WHERE deleted_at IS NULL`), same pattern
as the three prior partial/trigram indexes in this repo — Prisma's
client no longer exposes a `schoolId_name` compound-unique input for
this table, so `seed.ts`'s own component upsert had to move from
`upsert(where: schoolId_name)` to an explicit find-then-write.

Computation lives in `apps/api/src/grades/grade-computation.ts` as
plain exported functions, not a NestJS `@Injectable()` — `seed.ts` uses
a bare `PrismaClient` with no DI container, so an injectable service
would be uncallable from it. Three implementation choices, not spelled
out in the spec:
- Grade-boundary lookup rounds a decimal total to the nearest whole
  point (clamped [0,100]) before the boundary lookup, since boundaries
  are integer-tiled but totals are decimal.
- `term_overall_results.average_score` is a simple unweighted mean of
  the student's subject totals (SPEC_V0.4.md §6 flagged the weighted
  alternative as a future refinement, not this step's job).
- `term_overall_results.status` derives automatically from its subject
  statuses (PUBLISHED only once every subject is; PENDING_APPROVAL if
  there's any activity short of that) — publishing is a real per-
  subject action seed must simulate explicitly (no endpoint exists
  yet), but overall status/positions are always computed, never a
  separate manual step, matching "publishes when all its subject
  results are published."

Seed: realistic First Term Mathematics + English scores (deterministic
sin-hash pseudo-random per student/component, not `Math.random()` —
stable across reseeds) across Sunrise's JSS 1 A and JSS 2 A, one
subject/class slice at Hillcrest. JSS 1 A Mathematics left
PENDING_APPROVAL, English PUBLISHED (both demoable); JSS 2 A and
Hillcrest fully published, exercising positions end to end. Proved:
seed ran 3× with identical row counts (657 student_scores / 219
term_subject_results / 110 term_overall_results on the live dev DB);
migrations + seed also run clean against a genuinely empty database (a
throwaway container, not the persistent dev DB); a named student's
hand-recomputed weighted total (17/20×20 + 17/20×20 + 87/100×60 =
86.20) matches the stored `term_subject_result` exactly; each school's
active (non-deleted) components still sum to 100 after seeding;
soft-deleting a component with scores via the real `PUT
/assessment-components` endpoint and re-adding one with the same name
in the same call left all 218 referencing `student_scores` rows
intact and un-orphaned, with the active set still summing to 100.

Found and fixed a real, pre-existing data-hygiene gap while producing
that proof evidence, unrelated to this step's own schema work:
`seed.ts`'s grade-boundary seeding only ever upserted the 9 WAEC grades
by name and never removed anything outside that set, so Sunrise's
`grade_boundaries` had accumulated a second, overlapping "Simple A-F"
preset (5 rows) left over from earlier manual/acceptance UI testing —
both sets active simultaneously made grade-band resolution ambiguous
for any score both covered (confirmed: it silently returned whichever
boundary the DB happened to return first for a tied `sort_order`).
Fixed by having `seedAssessmentStructure` delete any boundary outside
the WAEC set after upserting it, converging to exactly 9 rows per
school on every run — same self-healing idea as the
assessment-components fix above, applied as a plain delete since
`grade_boundaries` carries no historical references to preserve. Also
fixed `test/assessment-components.e2e-spec.ts`'s `afterAll`, which used
to hard `deleteMany` the whole school's component set directly via
Prisma to reset state between test files — that now FK-violates once
`student_scores` can reference these rows, so it goes through the real
`PUT /assessment-components` endpoint instead (soft-deletes correctly
on its own).

Added `isProprietor()` to `apps/web/src/lib/roles.ts`, mirroring
`isSchoolAdmin()` — the first owner-only permission split in this app
(step 3's unpublish/override-on-published actions), per the pre-step-1
spec resolution. No new role; `RolesGuard`'s existing `@Roles(...)`
OR-list already supports it server-side.

Out of scope, confirmed unchanged: no `/grades/*` endpoints (step 2),
no frontend UI for grades. `docs/API.md` updated only for the existing
`PUT /assessment-components`'s new optional request fields (`id`,
`requiresApproval`, `maxScore`) and its soft-delete replace semantics —
no new endpoints, no response shape changes.

## 2026-08-12 — v0.4 step 2: score-entry API + computation engine
Decision: `GET /grades/grid`, `PUT /grades/grid`, `POST /grades/recompute`
(planned and approved before building — see the step-2 plan in
conversation). Fine-grained authorization (tenant-scope 404s, TEACHER
assignment 403s) lives inside `GradesService`, not a dedicated Guard —
matches every other fine-grained check in this codebase (subject-
assignments, students); `RolesGuard` only ever does coarse role-list
gating, and GET's query params vs PUT's body have different shapes
anyway, so a generic Guard would need per-route param extraction with
little reuse benefit. Resolution order matters: tenant-scope check first
(404 on any miss, unconditional), TEACHER-assignment check second (403) —
guarantees a cross-tenant probe always gets a uniform 404 regardless of
role, never leaking "this exists but you can't touch it" via a 403.

`PUT /grades/grid` is atomic per request (all validation before any
write, one transaction) and idempotent via `student_scores`' existing
composite unique as the upsert key. A `pg_advisory_xact_lock` keyed on
`(schoolId, subjectId, classArmId, termId)` — not per-student, not per-
component — serializes concurrent grid saves to the same subject+class+
term, same discipline as `StudentsService`'s admission-number lock;
proved with a real concurrent-request e2e test (two `PUT`s writing
different components for the same student via `Promise.all`, asserting
the final `total_score` reflects both, not a lost update) rather than
just reasoning about it.

A `term_subject_results.status = PUBLISHED` lock rejects the **whole
batch** with `409` if any affected student's result is already published
(vs. silently skipping just the locked ones) — simpler, and matches
"atomic per request." `POST /grades/recompute` reuses the identical
recompute path and the identical `409` lock; unlike score writes it isn't
audited (a derived-state refresh, not a source-of-truth mutation) and
returns `200` via `@HttpCode(OK)`, not the `POST` default `201` — same
convention this codebase already uses for `.../withdraw`,
`.../transfer-class`, and auth's login/refresh/logout/change-password
(action-on-existing-data, not resource creation).

`PUT /grades/grid`'s response returns only the **touched** rows (each
with its saved `rawScore` plus the freshly recomputed `total_score`/
`autoGrade`/`finalGrade`/`status`), not a full-roster echo like `GET` —
the frontend already holds the rest of the grid from its last `GET`, and
fetching the whole roster's `term_subject_results` on every save added
real cost for no proven value this step.

Real gotcha found while writing the e2e proof, not by reasoning: running
`assessment-components.e2e-spec.ts`'s full test suite (whose `afterAll`
restores CA1/CA2/Exam by re-`PUT`ting with no `id`s) always swaps in
fresh, score-less component ids — correct per step 1's soft-delete design
(old ids soft-delete, keeping their history intact), but it means "the
currently-active CA1 has historical scores" is not a stable assumption
across a full-suite run. A `GET /grades/grid` e2e test that asserted this
against the real seeded Mathematics data was flaky depending on whether
`assessment-components.e2e-spec.ts` had run first in the same `pnpm test`
invocation. Fixed by making that test round-trip against the isolated
scratch subject instead (write a known score, then assert `GET` reflects
it) rather than depending on external seed history.

e2e fixture strategy: tests that only exercise rejection paths (401/403/
404/409) run directly against the real step-1 seed data, since a rejected
write never mutates anything — including the `409` test, which reads and
attempts a write against the real, seeded **PUBLISHED** JSS 1 A English
result and asserts it's byte-for-byte unchanged after. Tests that actually
write (happy path, idempotency, missing-score-as-0, the ~100-student JSS
2 A bulk save, concurrency) run against a dedicated scratch `Subject`
created in `beforeAll` and torn down in `afterAll` — no scratch
`AssessmentComponent` needed, since assessment components are school-wide
(not per-subject), so the real CA1/CA2/Exam can be reused safely against
the scratch subject without affecting Mathematics/English's own cached
totals (a component missing a score always contributes 0 regardless of
which subject it's scored against). This keeps the whole new suite fully
isolated from step 1's hand-verified demo state while still exercising
every real code path, proved by running the full e2e suite (196 tests,
20 suites) against both the live dev DB and a from-scratch throwaway
database twice.

Full ci green (typecheck, lint, e2e ×2 including a fresh-DB run, frontend
unaffected). No schema/migration changes this step, confirmed — `grade-
computation.ts` itself untouched, only imported.

## 2026-08-12 — v0.4 step 2 review fixes: DTO bound, structured 409, two regression e2e
Decision (post-review follow-up to the same-day step-2 commit): four
fixes, all pre-approved by review before building.

1. Dropped `GridScoreItemDto.rawScore`'s `@Max(100)` entirely — the only
   valid upper bound is the specific component's actual `max_score`
   (already checked in `GradesService`), which the real `PUT
   /assessment-components` endpoint happens to cap at 100 today but the
   DTO shouldn't assume that will always hold; a DTO-level cap duplicates
   a check that belongs solely to the service and would silently false-
   reject a legitimate score the moment any component's `max_score`
   exceeds it. Proved with an e2e that creates a component with
   `max_score: 120` directly (bypassing the assessment-components
   endpoint's own 1-100 validation, same as this suite's existing
   scratch-subject pattern) and asserts a `rawScore` of 110 saves.

2. `PUT /grades/grid`'s and `POST /grades/recompute`'s `409` now return
   `lockedStudentIds: string[]`, not just a count in the message — a
   director/owner UI needs to know exactly which students are blocking a
   save. This required extending `AllExceptionsFilter` itself (shared
   infrastructure, not grades-local): it now spreads any extra
   properties an exception's response payload carries beyond
   `statusCode`/`message`/`error` into the response body, so a thrower
   can attach structured data (`new ConflictException({ message, extra
   })`) while every existing exception across the app — which never adds
   extra fields — is completely unaffected (confirmed: full e2e suite,
   198 tests, unchanged pass count aside from the 2 new tests below).
   `statusCode`/`message`/`error` stay filter-controlled regardless — a
   thrower's payload can't override them, only add to them. This is a
   real, deliberate widening of CLAUDE.md §5's error envelope (additive:
   the 5 mandated fields are always present and always filter-derived);
   worth knowing before assuming the envelope is closed to extension.

3. New e2e regression guard: score CA1, then Exam (status flips
   `DRAFT`→`PENDING_APPROVAL`), then re-save a *different* CA1 value with
   Exam untouched — asserts status stays `PENDING_APPROVAL`, not reset to
   `DRAFT`. Was already correct by construction (`recomputeStudents`
   always re-derives status from the student's full current score set,
   never from "was this particular write the approval component"), but
   had no test pinning it down before a future change to that function
   could regress it silently.

4. The ~100-student bulk-save timing assertion now `console.log`s the
   elapsed ms (visible in CI output, not just pass/fail) and the ceiling
   tightened from 10s to 5s — observed ~130-165ms locally across several
   runs, so 5s still has generous headroom to catch a real regression
   without being flaky on a slower CI runner.

## 2026-08-12 — v0.4 step 3: review/publish/override API + position computation
Decision: `POST /grades/publish`, `POST /grades/unpublish`, `PUT
/grades/override`, per-subject and overall position computation. All
three of the pre-approved plan's flagged questions resolved before
building (recorded here, not re-derived): results-viewing endpoints
(`GET /grades/review` and friends) deferred to step 5, shaped by the web
that consumes them; override is `409`-blocked entirely while `DRAFT`
(the total isn't final pre-approval); a student's overall is ranked only
once *every* subject they have a result for is published — 5-of-6 stays
excluded, not partial-ranked, even though this means overall positions
can cluster near the end of a term's publish cycle rather than filling
in gradually. `grade-computation.ts` needed zero changes — every pure
function step 3 uses (`computeStandardCompetitionRanking`,
`resolveFinalGrade`, `computeOverallStatus`) already existed from step 1.

**Locking**: publish/unpublish/override all acquire the same per-subject
`pg_advisory_xact_lock` (`grades:{school}:{subject}:{classArm}:{term}`)
`saveGrid`/`recompute` already used — this is what stops a publish from
racing a concurrent score save. Publish/unpublish additionally acquire a
second, broader lock (`grades:{school}:{classArm}:{term}`, no subject)
before recomputing `term_overall_results`, which reads across every
subject a student has — proved necessary with a concrete race: two
different subjects for the same student, both `PENDING_APPROVAL`,
published concurrently; without the second lock each transaction's
overall-recompute phase can independently observe "not all published
yet" (since it can't see the other's uncommitted work) and neither ever
correctly flips the student's overall to `PUBLISHED` — a lost update, not
just a stale read. Proved via a real concurrent-publish e2e, not just
reasoning. Deadlock-free by construction: every caller that touches both
locks acquires them in the same fixed order (subject-lock, then
class-arm-lock) and nothing that only needs the subject-lock ever waits
on the class-arm-lock — no circular wait is possible.

**Position computation**: per-subject `subject_position` is recomputed
across the *entire* currently-published set for that subject/class/term
on every publish call, not just the rows that just transitioned —
publishing can happen in stages as stragglers' exam scores land, and a
second call must produce positions consistent with the first batch, not
a disconnected scale. `POST /grades/publish` is therefore idempotent when
called with nothing newly pending (`publishedCount: 0`, positions
reconfirmed). Overall positions only ever rank the "fully published"
cohort (established above); removing a student from that cohort (an
unpublish) re-ranks everyone who remains, proved with a dedicated e2e
(two students' positions both shift up after a third is unpublished out).

**Two real bugs found and fixed, not new step-3 scope creep — both in
step 2's `recomputeStudents`**, exposed once override made them
observable:
1. `finalGrade` was computed as `resolveFinalGrade(autoGrade, null)` —
   hardcoded `null` instead of the row's actual `override_grade`. Once
   override exists, a score write between setting an override and
   publishing would silently drop the override's effect on `final_grade`
   while `override_grade` itself stayed stored, correct-looking on its
   own but disagreeing with what the row displayed.
2. `subject_position`/`published_at` were never cleared by a recompute.
   Harmless in step 2 (nothing ever set them), but once `unpublish`
   reuses `recomputeStudents` to revert a formerly-published row, a stale
   position would otherwise survive unless cleared explicitly.
   `recomputeStudents` now unconditionally clears both on every call —
   safe because it only ever runs on rows that are not (or are mid-
   transition out of) `PUBLISHED`.

**Override's DRAFT-block invariant is enforced at two points, per
resolution**: the override endpoint itself (`409` on a `DRAFT` target),
and `recomputeStudents` (when a score write reverts a result's computed
status to `DRAFT`, any stored `override_grade` is nulled in the same
upsert, not left stale) — a `PENDING_APPROVAL` result can revert to
`DRAFT` via a plain score write clearing the approval-required
component's score, which would otherwise strand a previously-set
override on a total that's no longer final. Regression-tested directly.

**Publish/unpublish "nothing to do"**: both reject with `409` rather than
a silent `200`/no-op — publish when zero rows are `PENDING_APPROVAL` and
none are already `PUBLISHED` (message names how many are still `DRAFT`
vs. never scored at all); unpublish when zero rows are currently
`PUBLISHED`. Chosen over a quiet `200` because a director's misclick
against an untouched subject deserves a clear answer, not a response
that looks identical to genuine idempotent success — that idempotent
`200` case is real and distinct (re-publishing an already-fully-published
subject, or a subject with some already-published and none newly
pending, correctly succeeds with `publishedCount: 0`).

**Known, named, unsolved gap**: a school's assessment structure can be
configured with zero `requires_approval` components (nothing forces at
least one). If so, `computeSubjectStatus` can never return
`PENDING_APPROVAL` for that school — every result stays `DRAFT` forever,
which under this step's resolution means it can also never be published
*or* overridden (both require leaving `DRAFT`). Not solved this step —
would need either a validation rule in `PUT /assessment-components`
(require ≥1 approval-required component) or a spec resolution allowing
publish/override from `DRAFT` directly. Flagging per instruction rather
than silently building around it.

**Known, named, unsolved gap #2, found while constructing the e2e
fixtures, not by design review**: `saveGrid` still doesn't touch
`term_overall_results` (correctly out of scope — confirmed in the step-3
plan). But there's a specific stale-data path this enables: if a
student's overall is already `PUBLISHED` (every subject they've been
scored in so far is published) and a teacher then enters that student's
*first* score in a brand-new subject, the resulting new
`term_subject_result` row starts `DRAFT`/`PENDING_APPROVAL` — but nothing
recomputes `term_overall_results` for that student until some *other*
subject's publish/unpublish call happens to sweep through the class arm.
Until then, the student's overall keeps showing `PUBLISHED` with a real
(now-stale) `overall_position`, which is exactly the kind of leak
SPEC_V0.4.md §5 warns against — just via a different trigger (a score
write, not a publish action) than this step was scoped to close. Not
fixed here: doing so would mean `saveGrid` sometimes needs the class-arm-
level lock too, a real scope expansion beyond "wire publish/unpublish/
override," not something to slip in unapproved. Worth a decision next
time grades work resumes.

**Related nuance surfaced while building the partial-term e2e**:
`term_overall_results.subjects_count` counts *existing*
`term_subject_result` rows, not a student's full expected course load
(unchanged from step 1). A student who's only ever been scored in 1 of
their real N subjects reads as "complete" (1-of-1) the moment that one
subject publishes — the "5-of-6 excluded" framing only actually applies
to a student who has *multiple* touched subjects with at least one still
unpublished, not to a subject they simply haven't been scored in yet.
Confirmed correct given step 1's frozen `subjectsCount` semantics; the
e2e's "partial-term" student was constructed accordingly (two touched
subjects, one published, one deliberately left pending) rather than the
simpler-but-not-actually-testing-the-rule "only one subject, never
touched a second."

**e2e isolation, one level deeper than step 2's**: step 2's scratch-
subject-only isolation isn't enough here, because
`term_overall_results` ranking is scoped to the whole `(class_arm_id,
term_id)` — every subject *any* student in that arm has ever been
scored in, not just the one subject under test. Reusing JSS 2 A (step
1's real, hand-verified Math/English data) for any step-3 scratch fixture
would have pulled that real data into every overall computation this
suite triggers. Fixed two ways: (a) all of this suite's fixtures live in
an untouched real arm (Sunrise's JSS 2 B — confirmed zero
`term_subject_results` from seed) rather than JSS 1 A/2 A; (b) the
specific tests that assert on *absolute* `overall_position` values
(partial-term, the two-concurrent-publishes race) additionally use their
own freshly-created scratch `ClassArm`, torn down in `afterAll`, since
even JSS 2 B is shared across every other test in the same file and
those tests' own scratch subjects would otherwise pollute one shared
ranking pool. Caught by a real, reproducible test failure (expected
position 2, got 5) before it shipped, not by inspection.

Full ci green: typecheck, lint, full e2e suite (219 tests, 21 suites) ×2
including a from-scratch database, the publish/unpublish/override suite
alone re-run 3× back to back to rule out concurrency-test flakiness. No
schema/migration changes this step.

## 2026-08-13 — v0.4 step 4: bulk score-entry grid (web) + two targeted API extensions

Built the score-entry grid (SPEC_V0.4.md §4 item 1): class-arm+subject+
component+term picker → a flat, non-virtualized list of one row per
student, keyboard-first (Tab/Enter/ArrowUp/ArrowDown), save-as-you-go via
a debounced (600ms) + max-wait-capped (2000ms) batched `PUT /grades/grid`.
No schema change; two small, pre-approved API extensions plus one
additive field:

- **`GET /grades/grid` rows now carry `status`** (`DRAFT`/
  `PENDING_APPROVAL`/`PUBLISHED`, subject-level, sourced from
  `term_subject_results`) so the grid can render published rows locked
  from initial load rather than reactively on the first `409`. Proven at
  the source: a new e2e in `grades-grid.e2e-spec.ts` asserts a single
  `GET` returns a genuinely mixed published/draft/never-scored roster.
- **`GET /assessment-components` extended to `TEACHER` (read-only)** —
  matches the precedent already set by `GET /grade-boundaries`; the
  grid's component picker needs it and `TEACHER` had no other path to it.
- **`GET /me/teaching` now returns `currentSessionId`/`currentTermId`/
  `currentTermName`** — `TEACHER` has no access to `GET /sessions`/`GET
  /terms` (admin-only) and needed a way to discover the current term
  without opening those endpoints up.

**Save-as-you-go design**: a 6-state per-cell reducer
(`idle|pending|saving|saved|error|locked`), buffer-is-the-retry-queue (a
failed or re-edited cell just stays `pending`/`error` and gets swept into
the next flush — no separate retry-tracking structure). A global (not
per-cell) in-flight lock serializes flushes; a "check-before-applying"
clobber guard on every flush response (only transition a cell if
`current.value === sentValue`) makes this safe without
`AbortController`— a stale response for an already-re-edited cell is
silently ignored. `400` on a >1-cell batch splits and retries each cell
individually (the batch is atomic; we don't know which cell was bad
without parsing an error string). `409`'s `lockedStudentIds` locks
exactly those cells and immediately retries the rest as one fresh batch.

**Three scope decisions, made explicitly rather than assumed**:
1. **No permanent browser-e2e suite added.** Proven live instead via a
   scratchpad-only Playwright script (installed under the session
   scratchpad, never touching `apps/web/package.json` — CLAUDE.md's fixed
   stack has no browser-e2e tool yet). A standalone Playwright/Vitest-
   browser-mode suite remains a deferred option for whenever browser-e2e
   coverage becomes a standing need, not folded into this step.
2. **No localStorage persistence for the save buffer.** In-memory-
   survives-a-network-blip is the bar for this step (the actual ask:
   "Nigerian realities, 2G/flaky" — a mid-typing network drop, not a
   crash/full-reload). `beforeunload` warns against accidental
   navigation but can't guarantee a save completes on unload. **Known
   limitation**: a hard browser crash or reload mid-edit loses any
   `pending`/`error` cells not yet flushed — add localStorage buffering
   only if a pilot teacher actually hits this in practice.
3. **Live class-average display deferred to step 5's grades overview** —
   this step is score entry only; an aggregate view belongs with the
   overview/review UI, not bolted onto the entry grid.

**No virtualization** — a flat DOM list of ~150 single-input rows,
`React.memo` per row plus stable reducer object identities (only the
edited cell's object changes) keeps re-render cost scoped to the touched
row. Virtualizing would break native `Tab` traversal across unmounted
off-screen rows. Empirically proven, not just argued: see the live-stack
walk below.

**RBAC bug caught by a failing test, not review**: the picker's admin-
only current-term hook was gated `useAdminCurrentTerm(!isTeacher)`.
`isTeacher` is `false` on the very first render (before `/auth/me`
resolves, role is unknown) — so `!isTeacher` is `true` regardless of the
caller's real role, firing an admin-only `GET /sessions` once before
`TanStack Query`'s `enabled` flag can stop it (a query already in flight
doesn't un-fire). Fixed by gating on `isConfirmedAdmin =
role === SCHOOL_ADMIN || role === PROPRIETOR` — defaults to disabled
("fail closed") while role is unknown, instead of defaulting to enabled
("fail open"). General lesson for this codebase: any role check used to
gate a hook's `enabled` must default to the safe state during the
role-unknown window, not just check the negation of one specific role.

**Two small, unrelated component bugs found while building the row**:
`useRef<HTMLInputElement>(null)` produces a read-only ref (TS overload
resolution) — needed `useRef<HTMLInputElement | null>(null)` for the
callback-ref pattern. The shared `Spinner` component only forwards
`className`, not `aria-label` — wrapped it in a labelled `<span>` at the
one call site that needed it rather than extending the shared primitive.

**e2e isolation, same lesson as step 3, hit again**: the new mixed-status
`GET` test initially reused the shared `scratchSubjectId` with "unused"
student indices to avoid collision — still broke three *later* tests,
because publishing even one student 409-locks that whole subject for any
subsequent "write to the whole roster" call, regardless of which student
indices are involved. Publish/lock is per-subject-batch, not per-student.
Fixed with a fully dedicated, self-contained scratch `Subject` created
and torn down inside the test itself. Caught by an actual failing test,
not by inspection — worth remembering as a standing rule for this suite:
any state-mutating scratch fixture (publish, override, unpublish) needs
its own dedicated resource, not a shared one with "safe" indices.

**Live-stack proof** (scratchpad-only Playwright driver against the real
docker-compose Postgres + host `pnpm start:dev`/`pnpm dev`, logged in as
`teacher@sunrise.test` against the real ~102-student JSS 2 A Mathematics
roster): keyboard-only entry (type + `Enter` to advance, explicit
`ArrowUp`/`ArrowDown` check) confirmed saving; values confirmed to
survive both an in-session refetch and a full logout → relogin → refetch
(the meaningful "reload persists" proof — a *hard* page reload discards
the in-memory-only access token by design, see `auth-store.ts`, so a raw
`F5` mid-edit always re-prompts login, which is expected and unrelated to
this step); a simulated offline edit correctly showed the error/retry
glyph and auto-recovered to saved within ~1s of reconnecting; 100+-row
timing showed no jank (scroll+click+type on the last row: ~84ms;
mid-roster keystroke latency: ~5ms), validating the no-virtualization
call empirically rather than just architecturally.

Full ci green: typecheck + lint (api/web/shared), full e2e suite
(220 tests, 21 suites) on a from-scratch database, existing suite
otherwise unchanged. No schema/migration changes this step.

## 2026-08-13 — v0.4 step 4 fix: a slow flush could strand a later edit with no timer armed

Bug (web only, `use-score-entry-save-queue.ts`): if an edit landed while a
flush was already in flight, and that edit's own debounce (600ms
default) *and* max-wait (2000ms default) timers both elapsed before the
in-flight flush resolved — reachable whenever a save outlasts
`MAX_WAIT_MS`, e.g. a >2s `PUT` on a bad 2G connection — both of those
timer callbacks early-returned on `flushInFlightRef` and were gone
(one-shot `setTimeout`s, never rearmed). `attemptFlush`'s `finally` only
reset `flushInFlightRef`; it never re-checked for work that had piled up
during the flight. The stranded cell sat `pending` with literally nothing
scheduled to save it — not until the next keystroke or component unmount.
The offline/error path already self-heals via `sendBatch`'s
`scheduleRetry`; this was the same class of gap on the plain-success path.

Fixed by re-checking `stateRef.current` for `pending` cells at the end of
`attemptFlush`'s `finally` (after `flushInFlightRef.current = false`) and
immediately calling `attemptFlush()` again if any remain — a safe
self-recursive closure reference (`attemptFlush` isn't in its own
`useCallback` deps; the reference only resolves when the callback
actually runs, well after the `const` assignment completes, same
established pattern as `sendBatch`'s existing lint-suppressed self-
references in this file). Deliberately scoped to `pending` only, not
`error`: an `error` cell already has its own `scheduleRetry(ERROR_RETRY_MS)`
backoff armed independently inside `sendBatch`'s `catch`; re-triggering it
here too would bypass that backoff and hammer the server on a persistent
failure instead of respecting the retry delay.

Regression test added with `vi.useFakeTimers()` — the first use of fake
timers in this codebase's Vitest suite (existing debounce tests all use
real timers + small millisecond overrides + `waitFor`, per established
convention; fake timers were the right tool here specifically because the
scenario needs both of a *second* cell's timers to deterministically
elapse while a *first* cell's flush is deliberately held open). Drives
edits via `fireEvent.change` (not `userEvent`, which has its own internal
real-time delays that don't mix well with a faked clock) and advances via
`vi.advanceTimersByTimeAsync` inside `act()`. Confirmed the test fails
without the fix (`git stash` on just the source file, re-ran: stuck at 1
batch sent, never reaches 2) and passes with it, before committing either.

Full ci green: typecheck + lint, web Vitest (103 tests, 23 files), full
backend e2e suite (220 tests, 21 suites) — unaffected, confirming this is
a self-contained frontend fix. No schema/migration/API changes.

## 2026-08-13 — v0.4 step 5: grades overview + review/publish/override UI + student Results tab

Built the three read endpoints SPEC_V0.4.md §2 deferred from step 3, plus
the web that consumes them (SPEC_V0.4.md §4 items 2-4). No schema change.

**Three endpoints, kept separate on purpose**: `GET /class-arms/:id/results`
(overview — per-student-per-subject matrix, ~O(subjects×students) sized,
readable by TEACHER/admin/owner), `GET /grades/review` (director/owner-
only publish-readiness dashboard — per-subject counts only, no per-student
rows, small regardless of roster size), `GET /students/:id/results`
(one student's own results). Consolidating any two would have either
forced the teacher-facing overview to pay for review's missing-count
aggregate it doesn't need, or forced review's response down to a subset
shape the client would have to guess at. **Route naming**: spec text said
`GET /classes/arms/:id/results`; the real controller is `@Controller
("class-arms")` (`class-arms.controller.ts`), so the actual route is
`GET /class-arms/:id/results` — spec's `/classes/arms/...` was shorthand,
not a literal path; corrected in docs/API.md.

**One unifying teacher-visibility rule** (`GradesService.
resolveTeacherAccess()`), shared by both `getClassArmResults()` and
`getStudentResults()` but consumed differently: class-teacher of an arm+
session sees everything there; a subject-only teacher sees just their own
subject(s). The overview endpoint uses it to *filter which subjects
render* (and whether the `overall` column appears at all — a subject-only
teacher never sees it, since it aggregates data across subjects they
don't teach). The student-results endpoint uses the SAME underlying
check but as a plain allow/deny: once a teacher has *any* relationship to
the student's class arm, they see the student's FULL results, all
subjects — deliberately looser than the overview, because "do I know this
student" and "which subjects on this shared classroom screen are mine"
are different questions. `students.service.ts`'s `findOne` remains
unchanged (no teacher-scoping at all, pre-existing since v0.1) — the
Results tab is reachable from a page with looser access than the tab
itself, so a 403 there renders as a graceful in-tab message, not a hidden
tab (no other tab on that page gates on relationship-to-student either).

**Review returns per-status COUNTS, not one enum**: `saveGrid`'s per-
student `PUBLISHED` lock means stragglers can land in `PENDING_APPROVAL`
after classmates are already `PUBLISHED` for the same subject (publish()
already documented this: "can legitimately happen more than once"), so a
subject's state is genuinely a breakdown. `canPublish` is server-derived,
mirroring `publish()`'s exact `409` condition
(`pendingApprovalCount > 0 || publishedCount > 0`) — proven against the
REAL `409`, not just asserted in isolation (grades-review.e2e-spec.ts).
`status=` filters to "at least one student in this status" — the only
filter semantic that makes sense on a breakdown rather than a scalar.

**Overview rows carry `id`/`autoGrade`/`overrideGrade`, not just
`finalGrade`** — added after starting the frontend, once it became clear
the override dialog (spec: "clearly marked as a manual override with the
auto grade still shown") needs the `term_subject_result` id to target and
the auto grade to display underneath a possibly-already-set override;
`finalGrade` alone collapses that distinction. Mirrored in
`packages/shared/src/grades.ts` and asserted directly in
class-arm-results.e2e-spec.ts's happy-path test.

**Owner-vs-admin override permission is three-valued, not boolean**:
`"none"` (TEACHER) / `"pendingOnly"` (SCHOOL_ADMIN — matches `override()`'s
existing DRAFT-block, but SCHOOL_ADMIN additionally can't touch a
`PUBLISHED` row) / `"any"` (PROPRIETOR). `ClassArmResultsView` computes
per-row eligibility from this and the row's own status, so the override
pencil icon is simply **absent** (not disabled) wherever the server would
403 or 409 it — same "don't offer a control that'll just error" principle
as every prior step. Proven via DOM-presence assertions
(`getAllByLabelText(...).length`), not just a disabled-attribute check.

**Unpublish dialog names the blast radius, per explicit instruction**:
danger tone, no typed-confirmation, but the description states the
cascade outright — "reverts {subject} to pending and recomputes overall
positions for the whole class" — since unpublish re-triggers step 3's
whole-class-arm overall recompute, not just a revert of the one subject.
A proprietor clicking Unpublish should never be surprised other students'
standings moved too.

**RBAC-in-UI mechanism corrected mid-build**: the step-4 plan assumed no
client-side route guard existed anywhere in this app. Wrong — `apps/web/
src/app/RequireSchoolAdmin.tsx` already exists (used for `/personnel`,
loading-aware so it doesn't bounce a legitimate admin before `/auth/me`
resolves). `/grades/review` now uses it, matching `/personnel`'s exact
pattern, instead of relying purely on "no nav link + a raw 403 render."
`/grades/overview` (TEACHER-readable too) has no such guard, correctly.

**A real "fail open while role unknown" bug, caught by a failing test,
not by inspection**: `GradesOverviewPage`'s picker reuses the SAME
`id="overview-class"`/label "Class" for both the TEACHER and admin-only
JSX branches (unlike `ScoreEntryGridPage`, which uses distinctly-labeled
pickers per role). `isTeacher` defaults `false` before `/auth/me`
resolves — the SAME class of bug already fixed once this session
(`ScoreEntryGridPage`'s admin-only query firing early) — but here it
doesn't just fire a doomed query, it renders the *wrong branch's select*
under the right-looking label for one render. A Vitest assertion
(`findByLabelText("Class")` grabbing 0 real options instead of 2) caught
it directly: `screen.debug()` on the resolved element showed a disabled,
placeholder-only `<select>` — the admin branch, rendered for a TEACHER,
during the brief window role was still unknown. Fixed by adding a
`roleKnown` guard that renders a neutral loading state instead of
defaulting into either branch. `ScoreEntryGridPage` doesn't have this
exact symptom (its teacher/admin picker labels don't collide, so no
`getByLabelText` grabs the wrong one) but likely has the same underlying
one-tick flash — left alone as out-of-scope, already-shipped, already-
reviewed step-4 code; not touched here.

**Live-stack proof** (scratchpad-only Playwright, same pattern as every
prior step, against the real docker-compose Postgres + host `pnpm start:
dev`/`pnpm dev`): logged in as `admin@sunrise.test`, published JSS 1 A
Mathematics First Term (seeded `PENDING_APPROVAL` exactly per
SPEC_V0.4.md §3) from the Review & Publish screen — confirmed the confirm
dialog's exact wording, confirmed the subject's counts flipped from
"0 published · 7 pending" to "7 published · 0 pending" on the SAME page
without a reload; confirmed the Grades overview for the same arm+term now
shows real `#N` positions instead of "Not yet ranked"; confirmed a real
seeded student's (Oluwaseun Adeyemi) Results tab renders both the
newly-published Mathematics row and the already-published English
Language row plus an Overall section. Left the publish in place afterward
(a real, harmless director action on seed data, same as leaving typed
scores in place after step 4's walk).

Full ci green: typecheck + lint (api/web/shared), full e2e suite
(241 tests, 24 suites — 21 new tests across the three new spec files) on
a from-scratch database, web Vitest (126 tests, 27 files — 21 new tests
across four new spec files, plus the existing route-smoke test extended
with the two new routes). No schema/migration changes this step.

## 2026-08-14 — v0.4 step 6 part 1: gap #2 fix — saveGrid no longer strands a published overall

Fixed the gap flagged (not built) at the end of step 3: `saveGrid`
creating a student's FIRST-EVER `term_subject_result` for a subject,
while that student's `term_overall_result` is currently `PUBLISHED`,
used to leave the overall stale — still `PUBLISHED`, still carrying its
old `overall_position`, even though the student now has an unpublished
subject. Surfaces as a wrong published rank on a future report card.

**Trigger, made decidable rather than heuristic**: the only reachable
case is "no existing `term_subject_result` row for this (subject, term)"
AND "the student's overall is currently `PUBLISHED`". Nothing else can
reach it — if the student already has a row for this subject and their
overall is `PUBLISHED`, that row must itself already be `PUBLISHED` (an
overall can only be `PUBLISHED` if every touched subject is), and
`saveGrid`'s pre-existing `lockedStudentIds` check already 409s that case
before any recompute logic runs. Detection reuses `existingResults`
(already fetched for that same 409 check, zero new queries) to find
`studentsWithNoExistingRow`; the one additional `term_overall_result`
query fires only when that list is non-empty, and "no overall row" reads
as not-published rather than throwing. Net effect: the ordinary
"re-save an already-touched grid" path — the overwhelming majority of
real `saveGrid` calls — costs nothing extra, proven behaviorally (not
just argued) by a dedicated e2e asserting no `term_overall_result` row
appears as a side effect of either a create-only or an edit-only save
when no gap-#2 candidate exists.

**Lock order, unchanged from publish()/unpublish()**: subject lock always
first (unconditional, as before), class-arm lock conditionally second —
acquired only when `needsOverallRecompute` is true, always strictly after
the subject lock, and `saveGrid` never acquires any other subject's lock
afterward. That's the whole no-deadlock argument: the only lock any two
of these transactions ever contend on is the class-arm lock, and nothing
here ever holds it while attempting to acquire a *different* subject
lock — concurrent contention on the class-arm lock alone can only
serialize, never cycle. Transaction timeout bumped 15000ms → 20000ms to
match `publish()`'s existing budget for the same added class-arm-wide
phase (only actually spent when the branch fires).

**`POST /grades/recompute` carries the identical latent gap, left
untouched**: it drives the same `recomputeStudents` across a whole
roster and can equally create a first-ever row for a student whose
overall is published. Not fixed here — out of this step's explicit ask
(`saveGrid` only); flagged here rather than silently left undocumented,
for whenever it's picked up.

**Proof** — new describe block in `grades-publish.e2e-spec.ts`, with two
MORE dedicated scratch arms (`gapTwoArmId`, `gapTwoConcurrencyArmId`),
kept separate from the file's existing `overallArmId` so none of these
tests' students enter that arm's already-asserted absolute-position
ranking pool, and vice versa (same isolation discipline as `overallArmId`
itself):
- Stale-rank reproduction: 3 students published in one subject (positions
  1/2/3 by score); a brand-new second subject for the middle student
  reverts their overall to `PENDING_APPROVAL` with a null position and
  `subjectsCount: 2`, while the other two — untouched by the save itself —
  re-rank as the published cohort shrinks (3rd → 2nd).
- Hot-path no-op: proven behaviorally (no `term_overall_result` row
  appears) across both a create-only and an edit-only save with no
  gap-#2 candidate in play.
- Concurrency: a gap-#2-triggering `saveGrid` and a `publish()` on a
  *different* subject of the same arm, fired together — both `200`, no
  deadlock/timeout, and the final state is correct regardless of which
  transaction's class-arm-lock acquisition won the race (no lost
  update) — same verification style as the file's existing
  "two concurrent publishes" test.

Full ci green: typecheck + lint, full e2e suite (244 tests, 24 suites — 3
new tests) on a from-scratch database, existing `grades-grid`/
`grades-publish` suites otherwise unchanged and still green. No schema/
migration changes.

## 2026-08-15 — v0.5 step 1: absent state, term lifecycle, remarks — schema + computation + seed

Schema-only-first version. `student_scores.is_absent boolean @default(false)`
plus the existing nullable `raw_score` gives three states (not-entered,
scored, absent), guarded by a hand-added CHECK
(`student_scores_raw_score_or_absent_check`) so a row can never be both —
Prisma's DSL can't express a CHECK, same discipline as every partial-unique
index in this schema. `terms.closed_at`/`closed_by` follow the existing
nullable-timestamp-as-status convention (`deleted_at`, `published_at`).
New `term_unlocks` (one row per unlock/relock episode, not a flag —
"currently unlocked" = `relocked_at IS NULL`, enforced to at most one active
row per term+class-arm+subject by a hand-added partial unique index) and
`term_remarks` (two remarks + who/when each, triple-unique per
student+term+session) tables, five new named `User` relations for the
disambiguated FKs.

**`prisma migrate dev --create-only` caught a real regression before it
shipped**: the diff engine wanted to `DROP` both hand-added trigram indexes
(`students_first_name_trgm_idx`/`students_last_name_trgm_idx`) as an
unrelated side effect — they use `gin_trgm_ops`, untracked by
schema.prisma, so any unrelated schema change makes Prisma see them as
"extra". Removed the two `DROP INDEX` statements by hand; verified via
`psql \di` on both the pre-existing dev DB and a from-scratch one that both
indexes survive.

**Computation** (`grade-computation.ts`): `ComponentScoreInput` gained
`isAbsent: boolean`. `computeSubjectTotal` now skips a component when
`isAbsent` is true, same zero-contribution path as a null `rawScore` —
excluded, not a 0, not rescaled (hand-verified: CA1 18/20 w20 + CA2 ABSENT +
Exam 55/100 w60 = 51, not a 63.75 rescale). `computeSubjectStatus` now
treats "scored OR marked absent" as a decided outcome for the
approval-required check — an absent-for-exam student reaches
`PENDING_APPROVAL`, not stuck in `DRAFT` (extended now per the approved
plan, not deferred to step 2). Not-entered and absent give the identical
total but a different status — the regression case a future edit could
silently break. `grades.service.ts`'s `recomputeStudents` and `seed.ts`'s
own total/status calls both got the mechanical `isAbsent` field threaded
through to keep compiling — zero behavior change, `is_absent` defaults
`false` everywhere pre-existing.

**No backend unit-test harness existed before this step** — only
`test/jest-e2e.json`. Added `test/jest-unit.json` (colocated `src/**/*.spec.ts`,
already-installed `jest`/`ts-jest`, no new dependency) + a `test:unit`
script at both the api and root level, wired into the root `ci` script
(`pnpm run ci` → typecheck && lint && test && test:unit) so CI runs it —
a proof that doesn't run in CI rots. 7 new tests in
`grade-computation.spec.ts`: the hand-verified example, absent-for-every-
component (total 0), a mixed case, the not-entered-vs-absent regression,
and three `computeSubjectStatus` cases.

**Seed**: a fresh Second Term slice for Sunrise's ~102-student JSS 2 A
Mathematics — deliberately not First Term, so the already-reviewed v0.4
baseline stays untouched. `seedSubjectGrades` gained an optional
`absentStudentComponents` param (indices into that call's own
studentId-ordered enrollment list) to mark specific students absent on
specific components instead of giving them a deterministic score: 3
students, 3 different components, one of them the approval-required Exam.
Term closed by the principal (fixed timestamp, not `new Date()` — stable
across reseeds like `deterministicScore`). One fully-resolved
unlock → edit → relock round trip: a principal unlock reason, a direct
correction to one student's CA 1 score (no HTTP surface yet, same
seed-writes-state-directly pattern as the rest of this file), its
`term_subject_result` total recomputed to match, then relocked — the
`term_unlocks` row has both `unlocked_at` and `relocked_at` set, so it
never touches the active-unlock partial-unique index (which only guards
`relocked_at IS NULL` rows); reseed idempotency for that row instead uses
an explicit existence check, since there's no natural upsert key for a
resolved unlock.

**Proof**: migration applied clean via `--create-only` review, both against
the already-non-empty dev DB and a genuine `docker compose down -v` →
rebuild → `migrate deploy` from-scratch DB; seed re-run confirmed
idempotent on both (same unlock count, same absent count, no errors). Full
v0.4 e2e suite (244 tests, 24 suites) still green on the freshly seeded DB
— the new Second Term data didn't disturb any existing fixture. New unit
suite (7 tests) green. `pnpm run ci` green end-to-end (typecheck, lint,
244 e2e, 126 web Vitest, 7 unit) at both the api and root level. No API or
UI changes — schema/computation/seed only, per this step's explicit scope.

## 2026-08-15 — v0.5 step 2: absent API + completeness gate + gap-1 fix

**Absent entry**: `GridScoreItemDto` gained `isAbsent?: boolean` plus a
custom class-validator constraint (`RawScoreConsistentWithAbsenceConstraint`,
first custom validator in this codebase) enforcing the same mutual
exclusion as `student_scores`' DB CHECK — belt (DTO, 400) and suspenders
(DB CHECK, last resort) both live, proven independently by two different
e2e tests. `saveGrid`'s upsert now sets `isAbsent` EXPLICITLY on every
write (create and update), never a partial update — the same discipline
`rawScore` already had. This matters concretely: a student marked absent
last save who gets a real score entered this save must have `isAbsent`
flipped back to `false` in the SAME write, or the stale flag survives
alongside the new `rawScore` and violates the CHECK on that exact row.
Proven both directions (score-after-absent, absent-after-score) — both are
paths to the same CHECK-violating state. `GET /grades/grid` and `saveGrid`'s
response both surface `isAbsent` per row now (round-trip, not just write).

**Completeness gate (SPEC_V0.5.md §2.2)**: enforced inside `publish()`
only — the only finalization surface that exists. Reading of the spec's
"every student in the roster" wording: scoped to **publish CANDIDATES
only** (rows currently `PENDING_APPROVAL`, about to transition this call),
not the whole class-arm roster and not already-`PUBLISHED` rows. A literal
whole-roster reading would have required 100% of a class to be scored
before ANY student could publish, directly regressing v0.4's tested,
documented staggered/repeatable publish (stragglers finishing later, re-
publish calls that only pick up new PENDING_APPROVAL rows). The per-
candidate reading satisfies "no student is ever silently published with a
blank component" without that regression. "Blank" = no `student_scores`
row for (student, active component), or a row with `rawScore IS NULL AND
isAbsent = false` — both are indistinguishable today (both silently
contribute 0), which is exactly the bug being closed. Absent is NOT
blank — a decided outcome, so an all-absent-on-one-component cohort still
publishes (proven). Rejection is atomic: one incomplete candidate blocks
the WHOLE `publish()` call, including classmates who were individually
complete (proven — a complete classmate's row is asserted still
`PENDING_APPROVAL`, not partially transitioned). Rejection shape is
`incompleteEntries: {studentId, componentId}[]` — named `incompleteEntries`
deliberately, not reusing v0.4's `lockedStudentIds` (a different meaning:
locked = already published, blocking further writes; incomplete = not yet
publishable). Checked with one batched `student_scores` query over every
candidate at once (no per-student query), shared via a new private
`findIncompleteEntries` helper.

**`getReview()`'s `canPublish` kept honest**: its own doc comment already
promised it "mirrors publish()'s own nothing-to-do 409 condition exactly."
Once `publish()` gained the completeness gate, that promise would have
gone stale — `canPublish: true` while the real endpoint 409s is worse than
no flag at all, since step 5's web UI trusts it to gate the Publish button.
`canPublish` now reuses the exact same `findIncompleteEntries` helper (one
definition of "complete," shared, not two that can drift), batched across
EVERY subject in the class-arm/term at once (no per-subject query) —
proven both directions against the REAL `publish()` outcome, not asserted
in isolation.

**Gap-1 fix (Q7)**: `AssessmentComponentsService.replaceAll`'s existing
`validate()` now also requires at least one `requiresApproval` component.
Confirmed by grep that `replaceAll` is the SOLE mutation path for
`assessment_components` (every create/update/soft-delete/hard-delete in
this codebase happens inside that one transaction) — no other endpoint or
service touches the table, so this one check covers every school, every
edit, with nothing left to find later. Forward-only: no backfill/migration
for an already-broken structure, since neither seeded school is affected
(both already have Exam `requiresApproval: true`) and there's no real
production data yet to protect.

**Existing-test ripple from the completeness gate — the sizable, non-
obvious part of this step**: the gate is genuinely behavior-changing for
any fixture that publishes a student scored on only 2 of the school's 3
active components (a very common shorthand across the existing suite: CA1
+ Exam, CA2 always left blank). ~10 previously-passing `publish()` calls
across `grades-publish.e2e-spec.ts`, `grades-review.e2e-spec.ts`, and
`class-arm-results.e2e-spec.ts` needed a CA2 score added before their
publish call to keep passing — chose `rawScore: 0` throughout (a real,
decided score, weight 20/max 20 → contributes exactly 0), which satisfies
the gate while leaving every one of those tests' hand-verified totals
completely unperturbed. One test (`assessment-components.e2e-spec.ts`'s
"accepts a valid 100-total set") had zero `requiresApproval` components in
its fixture and would have failed the NEW gap-1 check on an unrelated
assertion — added `requiresApproval: true` to its Exam-equivalent item.

**Proof**: full v0.4+v0.5-step-1 e2e suite plus this step's new/updated
tests all green on a freshly rebuilt, freshly seeded stack; typecheck +
lint clean; web Vitest and the new unit suite unaffected (no schema, no
web changes this step — API only, per the explicit scope). No migration —
`is_absent` and the CHECK already existed from step 1.

## 2026-08-15 — v0.5 step 3: term lifecycle API (close/unlock/relock) + gap-2-twin fix

**Endpoints**: `POST /terms/:id/close`, `POST /terms/:id/unlock`,
`POST /terms/:id/relock` — all SCHOOL_ADMIN + PROPRIETOR, no owner-only
split (same tier as `publish()`, not `unpublish()`). No "reopen the whole
term" endpoint exists or was added — `Term.closedAt`'s own schema comment
already ruled that out; editing a closed term is always per-slice via
unlock, matching the schema's original design intent.

**DELIBERATE DEFERRAL — recorded per explicit instruction**: SPEC_V0.5.md
§2.3's prose describes a teacher editing scores "freely, anytime,
including after publishing... re-publishes the corrected number" while a
term is open. The current v0.4 `saveGrid` doesn't do this — a `PUBLISHED`
row is unconditionally locked; `unpublish()` is required first, regardless
of term state. This step does NOT resolve that gap. The new closed-term
check is an OUTER gate that fires first (409, before the existing
PUBLISHED-lock check); the PUBLISHED-lock itself is completely untouched.
An active unlock grants "you may edit this slice despite the closed
term," not "you may also bypass the separate publish safeguard." Whether
v0.4's `saveGrid` should someday allow free post-publish editing within an
open term (per the spec's prose) is a separate, future decision.

**Race-safety — the actual point of this step's design**: a naive
pre-transaction read of `term.closedAt` would leave a real window where a
concurrent `close()` commits between the check and the write. Fixed with
a new term-level advisory lock (`termLockKey`), acquired FIRST by
`saveGrid` (every call, unconditionally) and by `close`/`unlock`/`relock`
(their only lock) — whichever transaction gets there first fully commits
before the other's read runs. Inside the lock, `saveGrid` re-fetches
`closedAt` fresh, never the object from the pre-transaction
`resolveTenantScopeWithComponent` call. Fixed acquisition order across the
whole module, extended by one position: `term -> subject -> (conditional)
class-arm`, never reversed — `publish`/`unpublish`/`recompute`/`override`
never touch the term lock at all, so the existing no-deadlock argument
(af94921) extends cleanly rather than needing to be re-proven from
scratch. `termLockKey`/`subjectLockKey`/`classArmLockKey` extracted into
one shared pure-function module (`grades/lock-keys.ts`) so
`GradesService` and `TermsService` can never compute even slightly
different strings for the same lock — a silent drift there would break
the whole serialization guarantee. Mechanical refactor of the existing
two key builders (identical strings) — proven by the full pre-existing
e2e suite staying green through it, unchanged.

**`recompute()` deliberately NOT gated by closed-term/unlock** — it only
re-derives `term_subject_result` from `student_scores` rows that already
passed the gate at write time; introduces no new data. Stays off the term
lock entirely.

**Unlock lifecycle**: "currently unlocked" = the partial-unique row
(`relocked_at IS NULL`) — an index lookup on `term_unlocks_active_unique`,
never a scan. Re-closing an already-closed term 409s (not idempotent like
`publish()` — there's no "reconfirm a close" semantic, and silently
overwriting `closed_at`/`closed_by` would destroy the original close
record). Unlocking an already-unlocked slice, relocking with nothing
active, or unlocking a term that isn't closed — all 409, checked before
any write.

**`close()` response (Q4 — warn-but-allow)**: returns the term plus
`unpublishedCount` and a `{classArmId, subjectId, draftCount,
pendingApprovalCount}[]` breakdown — ids only, no name joins (step 5
already has its own classes/subjects lists to resolve names against).

**Gap-2-twin fix**: `POST /grades/recompute` mirrors `saveGrid`'s af94921
fix exactly — conditional class-arm lock always after the subject lock,
only acquired when a real candidate exists (a student with no existing
row for this subject AND a currently-PUBLISHED overall). One real
difference from the original: `recompute()` re-derives the WHOLE roster
(no payload to scope an "affected" subset), so every untouched roster
student is a candidate, not just whichever ones a specific save touched —
proven by a stale-rank reproduction where recomputing a brand-new subject
reverts EVERY published-overall student in the roster at once, not just
one. The concurrency proof (recompute racing a publish on a different
subject of the same arm) converges to exactly ONE valid final state
regardless of interleaving (not two, unlike the saveGrid-vs-publish race)
— since `recompute()` touches the whole roster, both students end up with
a claim on the class-arm lock's cascade, and whichever runs second reads
both subjects' latest committed state.

**Proof**: new `terms.e2e-spec.ts` (20 tests — close/unlock/relock RBAC +
cross-tenant 404, warn-but-allow breakdown, re-close 409, the full
unlock→edit→relock→blocked-again round trip, per-slice isolation, every
409 case, close-vs-saveGrid and unlock-vs-saveGrid concurrency) plus 2 new
gap-2-twin tests in `grades-publish.e2e-spec.ts`. Every scratch fixture is
its own session+term+class-arm+subject+roster bundle (`createScratchBundle`)
— term close is one-way with no reopen, so reusing the real seeded First
Term (which every other e2e file depends on staying open) was never an
option. Full suite green on a freshly rebuilt, freshly seeded stack;
typecheck + lint clean. No migration — schema untouched, as scoped.

## 2026-08-16 — v0.5 step 4: report-card read endpoint + remarks API

**New endpoint, not an extension of the Results tab**: `GET
/students/:id/report-card` is a genuinely separate response shape from
`StudentResultsResponse`, not an additive field bolted onto it. The two
documents need different fields — the report card needs the full
per-component (`ReportCardComponent[]`) breakdown for every subject and
has no use for class average; the Results tab is the reverse (class
average, no components). Coupling them would force every future
report-card-only field (print/header metadata, step 6) to leak into the
admin quick-view's contract, or vice versa. Reuses the exact same
tenant/enrollment/TEACHER-access resolution as `getStudentResults()`
(same loose read rule: any relationship to the class arm) and the same
six-batched-query discipline — new shape, not new computation.

**Blank vs Abs, made legible in the payload**: a component with no
`student_scores` row at all is `rawScore: null, isAbsent: false`; an
explicit absence is `rawScore: null, isAbsent: true`. Only the currently
active assessment structure (`deletedAt: null`) is represented — matches
exactly what produced the `totalScore` shown alongside it.

**Remarks — the write split is enforced two different ways, deliberately**:
- Teacher remark (`PUT .../remarks/teacher`): TEACHER role reaches the
  handler, but the service additionally requires
  `resolveTeacherAccess(...).isClassTeacher === true` — a runtime check,
  because "is this teacher the class teacher" is data-dependent, not a
  fixed role. This is STRICTER than the report card's own read rule (any
  subject-teacher relationship suffices to read; only the class teacher
  may write this remark) — a subject-only teacher can view a student's
  card but gets 403 writing the class remark. SCHOOL_ADMIN/PROPRIETOR:
  no check, same "any tenant-scoped combo" pattern used throughout
  GradesService.
- Principal remark (`PUT .../remarks/principal`): SCHOOL_ADMIN/PROPRIETOR
  only, enforced at the ROUTE via `@Roles()` — TEACHER never reaches the
  handler at all, categorically, regardless of whether they happen to be
  the real class teacher (same "no TEACHER path" shape as `GET
  /grades/review`). A route-level gate was chosen over a runtime branch
  here because the rule is a fixed role split, not data-dependent — no
  reason to pay a service-layer check for something `RolesGuard` already
  settles.

**Remarks are NOT gated by the step-3 closed-term/unlock mechanism.**
That gate is scored-data-scoped (`saveGrid`'s write path specifically);
writing an end-of-term remark is part of the act of closing out a term,
not a score edit, and gating it the same way would make it impossible to
write a remark on a term that's already been closed — exactly when a
teacher/principal is most likely to be writing one. Deliberate, not an
oversight.

**Upsert semantics**: one shared `WriteRemarkDto` (`termId`, `sessionId`,
`remark: string | null`) for both routes, same required-but-nullable
shape as `OverrideGradeDto` — omitting the key is a 400 (client must be
explicit), `null` clears the remark AND nulls its who/when stamps (not
just the text), a non-empty string sets both. Plain `termRemark.upsert`
on the `(studentId, termId, sessionId)` unique — no advisory lock, unlike
`saveGrid`: a single-row upsert has no multi-row invariant to protect,
matching `TermsService`'s plain-Prisma-call style rather than
`GradesService`'s heavier lock-guarded transactions. Each route touches
ONLY its own side's three columns (teacher fields or principal fields),
proven not to disturb the other side by a dedicated bidirectional e2e
test — set both, clear teacher only (principal untouched), re-set
teacher, clear principal only (teacher untouched).

**Proof**: new `report-card.e2e-spec.ts` (16 tests) — per-component
assembly with a real score / blank / absent all distinct in the same
response, partial-term null overall position, the full RBAC matrix on
all three routes (including the two "stricter than you'd expect" 403s:
subject-only teacher writing the teacher remark, and the real class
teacher writing the principal remark), cross-tenant 404 on all three,
upsert round-trip + clear + one-sided-isolation. Full suite green (294
tests) on the existing stack; typecheck + lint clean. No migration —
schema untouched, as scoped. No web changes — API only, step 6's job.

## 2026-08-17 — v0.5 step 5: web — absent in the grid + completeness-gate UI + term close/unlock UI

**Closed-term grid indicator — render-from-load, a real (small) API
change.** `GET /grades/grid` gains `termClosed`/`locked`/`unlockReason`,
computed by a new `resolveSliceLockState` helper shared with `saveGrid`'s
existing check (refactored to call it too) so the two can never drift on
what "locked" means — same principle as step 3's `termLockKey` extraction.
Proven at the source with a 4-case API e2e (open / closed-no-unlock /
closed-with-unlock / per-slice isolation), same discipline as v0.4's
status field. `saveGrid`'s closed-term 409 also gained a structured
`termLocked: true` body field, mirroring `lockedStudentIds` — the save
queue only ever reaches this in a genuine race (grid loaded open, then
closed/relocked mid-edit), since the grid already renders locked-from-load.

**Absent is a flag orthogonal to the six cell-lifecycle states, not a
seventh.** `CellState` gained `isAbsent`/`serverIsAbsent`, mirroring the
backend's own `rawScore`/`isAbsent` mutual exclusion. Keyboard-first: `A`
while focused toggles it (a letter key was already inert in the
`inputMode="decimal"` field, so no collision), clearing any typed value;
a compact chip (`tabIndex={-1}`, click/discovery only, not a new Tab stop)
mirrors the same toggle for mouse users. Renders as a disabled input
showing fixed "Abs" text, `bg-muted/10`/`UserX` icon — deliberately a
different icon from the `Lock` used for published/term-locked cells, so
"not currently typeable" never looks like one single state.

**Term-wide lock is read LIVE from the grid query on every render, NOT
baked into cellState at hydrate time — this was a real bug caught by a
test, not a design guess.** `HYDRATE` only fires once per params key (by
design, to protect in-progress edits from an unrelated cache update); an
initial implementation folded `grid.locked` into each row's hydrate-time
`locked` flag, which meant a successful unlock (a cache invalidation +
refetch with the SAME params key) never re-hydrated and the grid stayed
visually locked forever. Fixed by keeping `HYDRATE`'s per-row `locked`
exactly as before (PUBLISHED only — legitimately sticky, updated
reactively only via the save queue's own 409 handling) and passing
`termLocked` as a separate LIVE prop from `ScoreEntryGrid` straight off
`gridQuery.data.locked` into every `ScoreEntryRow`.

**A real, pre-existing focus-stealing bug in `Dialog`, found and fixed
while building the Unlock reason input.** `Dialog`'s internal effect
depends on `[open, onClose]` and its cleanup calls
`previouslyFocused?.focus()`. Every existing `ConfirmDialog` caller passes
an inline `onClose` arrow function — harmless everywhere else, since none
of them have a text field a user types into while the parent re-renders.
`TermLockBanner`'s reason `<Input>` is the first one that does: each
keystroke re-renders the parent (controlled input), an inline `onClose`
is a new reference every time, the effect re-fires, and its cleanup
yanks focus back to whatever was focused before the dialog opened — after
exactly one character. Fixed narrowly in `TermLockBanner` (`useCallback`
for `onClose`, not touching the shared `Dialog`/`ConfirmDialog`
primitives) rather than reworking the shared components' effect
dependencies, per "extend, never rewrite" — but this same fragility is
latent in every other `ConfirmDialog` usage in this app; noted here for
whoever next adds a text field inside one.

**Completeness-gate UI is a defensive fallback, not the primary
mechanism — `canPublish` already disables the button correctly (step 2).**
The only realistic way to hit `incompleteEntries` in the UI is the same
kind of race as the term-lock 409: review data was fetched showing
`canPublish: true`, then something changed before the click landed.
`PublishConfirmDialog`'s error area branches on `error.body?.incompleteEntries`
and groups by `componentId` (via the already-available assessment
components list) into counts — "CA 1: 1 student, Exam: 2 students" — not
per-student names, deliberately: a roster-with-names join would add a new
fetch dependency to `ReviewPublishPage` for what's a rare-path fallback;
component-level grouping is enough to say WHERE to go look. The Publish
button's disabled tooltip was widened to a single honest combined
message instead of adding a new `canPublish`-reason field to
`GradesReviewSubject` — deliberately the smaller API surface for a
cosmetic distinction.

**Term close/unlock/relock UI, placement**: Close lives on the existing
`TermsSection` (Settings → Academic), next to Activate — a two-phase
`ConfirmDialog` → result `Dialog` (not a single dialog swapping its own
footer), since the unpublished breakdown only exists as the close
endpoint's own response, not a separate preview call; the result view
shows counts only (no class/subject names — `TermsSection` doesn't have
that data loaded, and joining it in would be scope creep for a summary
whose job is "go check Review & Publish for detail"). Unlock/Relock live
directly on the score-entry grid (`TermLockBanner`), not a separate
screen — classArmId/subjectId/termId are already in context there, and
that's where the need to unlock actually arises. Both hidden (not
disabled) for TEACHER, per the standing pattern (`canManage` prop, same
shape as `ReviewPublishPage`'s `canUnpublish`).

**Proof**: 11 new Vitest tests (absent toggle/render/mutual-exclusion/
locked-ignores-A in `ScoreEntryGrid.test.tsx`, the term-lock banner's
three visibility states, the completeness-gate fallback in
`ReviewPublishPage.test.tsx`, the two-phase close dialog in a new
`TermsSection.test.tsx`) — 137 total, up from 126. 4 new API e2e for the
grid indicator — 298 backend e2e unaffected otherwise. Full `pnpm run ci`
green on a freshly rebuilt, freshly seeded stack; typecheck + lint clean
across the monorepo; a chromium-cli live-stack walk covering the full
mark-absent → completeness-gate → close-as-principal →
teacher-sees-locked → unlock → edit → relock → blocked-again sequence.

## 2026-08-17 — v0.5 step 6: web — printable report card + remarks entry

**Route + entry point**: a dedicated `/students/:id/report-card` route, not
a fourth `StudentDetailPage` tab — printing wants a focused, chrome-free
document, and this page needs its own term/session picker (a card is most
often printed for whichever term just closed, not "current term" the way
the Results tab is scoped). Reached from a new "Print report card" button
on `StudentResultsTab` (pre-fills `?termId=&sessionId=` from what's already
showing there) and directly linkable/bookmarkable on its own.

**Print approach (Q5, client-side, no new dependency)**: Tailwind's
built-in `print:` variant (core, no plugin) plus `@page`/`@media print` in
`index.css`. `print:hidden` was added directly to `AppShell`'s sidebar
wrapper and `TopBar` — a **shared, global change**, not scoped to this one
feature: nothing in the app's nav chrome belongs in *any* printed output,
not just this page's. `window.print()` on a plain button; `break-inside-
avoid` on each subject/overall/remarks block as a page-break safety net for
schools with many subjects (the route is naturally one-student-per-page —
no list to worry about).

**Teacher term picker deferred (current-term-only)**: matches
`StudentResultsTab`'s existing precedent. The backend already permits a
TEACHER to read any term's card — this is a frontend scope call, not a
backend limitation, and it's noted here deliberately so a future step
doesn't mistake the gap for an oversight.

**Admin/proprietor sees BOTH remark forms**: the backend allows it (no
extra check beyond the class-level `@Roles()` on the teacher-remark route)
and the real workflow is a principal completing a card when the class
teacher hasn't gotten to it yet. Whoever saves a remark is stamped with
THEIR OWN name — an admin writing the "teacher remark" shows up under
their own name, never a fabricated "as the class teacher" attribution — so
the form copy says "Teacher remark," never "write as the class teacher."
Visibility: class teacher of this arm → teacher form only; subject-only
teacher → neither form (read-only remark text still shown, same "hidden
not disabled" pattern used throughout); admin/proprietor → both forms.

**Abs/blank/0 and partial-term rendering** reuse the grid's and
`StudentResultsTab`'s existing conventions verbatim (`componentDisplay`
mirrors `ScoreEntryRow`'s isAbsent → "Abs" / null → "—" / real value logic;
`positionLabel`, `resultStatusLabel/Tone`, `formatScore` are the same
helpers, not reimplementations) — a null `overall` renders an explicit
"Overall results not yet available." message, never a blank or zeroed row.

**Remark save UX**: `useWriteTeacherRemark`/`useWritePrincipalRemark`
patch the report-card query cache directly via `setQueryData` using the
saving user's own name (the response only carries the author's id, not
their name — but the saving user is always who gets stamped, so this is
never a guess) for instant feedback, then `invalidateQueries` triggers a
background refetch that lands the server's authoritative copy right after
— same person, just confirmed, never a raw UUID shown in the interim.

**New `Textarea` UI primitive** (`components/ui/textarea.tsx`) — no
multi-line input component existed yet; styled to match `Input` exactly,
same `forwardRef` shape.

**Proof**: 11 new Vitest tests (`ReportCardPage.test.tsx`: full-card
rendering, Abs/blank/0 distinct, partial-term states, all three
remark-form-visibility combinations, the optimistic-save-then-refetch
UX, print-hidden classes present; one new `StudentResultsTab.test.tsx`
case for the print-report-card navigation) — 148 total, up from 137. No
new backend e2e — `report-card.e2e-spec.ts` (v0.5 step 4) already covers
Abs/blank assembly, partial-term positions, every RBAC combination on all
three endpoints, cross-tenant 404s, and remark upsert/null-clearing
semantics; this step is web-only and added no new backend surface. Full
`pnpm run ci` green on a freshly rebuilt, freshly seeded stack; typecheck +
lint clean; a chromium-cli live-stack walk rendering a real student's card
(Abs cell, unpublished subject, existing remark), writing a teacher remark
as the class teacher, confirming a subject-only teacher sees no form,
writing a principal remark as admin, and a print-preview screenshot
showing the chrome-free card.

**Flaky pre-existing test found and fixed while confirming CI green**: the
pushed commit's GitHub Actions run failed on two step-5 tests in
`ScoreEntryGrid.test.tsx` ("pressing A... marks it absent" and the
mutual-exclusion test) — not anything in this step. Diagnosed over two
rounds:

Round 1 (wrong): assumed a same-tick propagation race (bare
`expect(input).toHaveValue("Abs")` immediately after `fireEvent.keyDown`,
no `await` in between) and wrapped the assertions in `waitFor`. This did
NOT fix it — the same two tests failed again on the next push, with the
value coming back completely empty (not just late), which a 1000ms
`waitFor` should have absorbed if it were only slow flushing.

Round 2 (the real bug): the mutual-exclusion test's SECOND `fireEvent
.keyDown(input, { key: "a" })` — toggling absent back off — targets an
input that is, by that point, `disabled` (isAbsent sets `isDisabled` in
`ScoreEntryRow`). `fireEvent` dispatches DOM events directly, bypassing
the disabled check a real browser enforces; a real user (and `userEvent`,
which respects it) cannot send keyboard input to a disabled element at
all — the only actually-reachable control at that point is the Abs chip.
The test was exercising a state transition that isn't reachable through
real interaction, and evidently something about how a disabled-element
keydown gets processed differs between the local (macOS) and CI (Ubuntu)
jsdom/Node environment enough to make it silently no-op only sometimes.
Fixed by switching both tests to `userEvent` throughout — `user.click
(input)` + `user.keyboard("a")` for the initial toggle-on (matching how
the file's OTHER absent-toggle test, which never flaked, already worked),
and clicking the chip (not a second keypress) to toggle back off, which
is what a real user would actually have to do once the input is disabled.

Confirmed via: reproducing the CI environment exactly (fresh worktree at
each pushed commit, throwaway Postgres/Redis matching the workflow's
ports, `pnpm install --frozen-lockfile`, identical env vars) — which
passed even on the broken Round 1 commit, correctly signaling that "fresh
install on the same machine" wasn't the actual differentiator; the real
CI logs (fetched via the local git credential helper's stored token,
since the Actions logs API needs write access otherwise) were what
actually pinpointed both the failing assertion and, on the second round,
its "received: empty" detail that ruled out pure timing. Re-confirmed
green locally (typecheck, lint, full Vitest suite) before the final
repush; GitHub Actions itself is the authoritative confirmation once that
push lands.

## 2026-08-17 — pre-tag v0.5 fix: Assessment Structure save was broken for any edit; assessment-components e2e now uses a scratch school

**The bug** (acceptance-walk finding #1): `AssessmentStructurePanel`'s form
never had a `requiresApproval` field at all — `toFormValues`/`addComponent`
only carried name/weight/sortOrder. Every save round-tripped
`requiresApproval` as omitted; the backend defaults an omitted value to
`false` per item (`item.requiresApproval ?? false` in
`AssessmentComponentsService.replaceAll`), so a save ALWAYS submitted zero
approval components — tripping the Q7 zero-approval-lockout check
(`docs/DECISIONS.md`, gap-1 fix) on every single save, not just a
deliberate bad one. A harmless weight nudge (CA1 −1, CA2 +1, still summing
to 100) 400'd with "At least one component must require approval." No
admin could rename, reweight, or add/remove a component via the UI at
all — the acceptance walk only caught this because it drove the real form
through a real save, not a mocked one.

**The fix**: `requiresApproval` is now a real, required field throughout
the mirror — `AssessmentComponent` (shared type), `assessmentComponentItemSchema`
(now `z.boolean()`, not omitted — deliberately required on the frontend
schema even though the backend DTO's own `@IsOptional()` stays as-is for
other API consumers), `toFormValues` (loads and preserves it per existing
component), `addComponent` (defaults `false` for a new row — a new
component isn't automatically the exam). A `Checkbox` UI primitive
(`components/ui/checkbox.tsx`, styled to match `Input`) gives each row a
real "Requires approval" control — the only place in the UI that can
designate which component gates publish, previously not achievable
through the interface at all.

**Client-side validation**: `validateAssessmentComponentsSet` (the
shared, hand-mirrored copy of the backend's rules — same file/pattern as
the weight-sum and unique-name checks it already had) now also mirrors
the Q7 rule verbatim, so a zero-approval state is caught and explained
before the round trip, not discovered as a raw 400. The Save button's
existing `disabled={!crossItem.isValid}` wiring picked this up for free —
no new UI needed for the block itself, only for the toggle control that
lets an admin *avoid* the zero-approval state in the first place.

**Also fixed (finding #2): `assessment-components.e2e-spec.ts` was
mutating the real seeded Sunrise tenant.** Unlike every other grades e2e
spec (`terms.e2e-spec.ts`'s `createScratchBundle`, etc.), assessment
components have no session/term/class-arm to scope a scratch bundle
into — they're school-wide, one set per school, full stop. The original
file's tests PUT directly against `admin@sunrise.test`'s real school, with
an `afterAll` that tried to restore the original set via another real PUT
— which doesn't restore original component ids (every PUT without an
existing `id` creates fresh rows), so a full-suite run against the
persistent local dev DB left Sunrise with soft-deleted originals and a
new component set, exactly the "duplicate-looking" mess the acceptance
walk tripped over. Fixed by giving the suite its own scratch SCHOOL
(via the real `POST /schools`, same as `schools-crud.e2e-spec.ts`'s own
scratch-school pattern) with its own admin, seeded with a baseline
structure in `beforeAll` — every PUT test now runs there, never Sunrise.
`afterAll` deletes the scratch school's assessment_components,
refresh_tokens (from `loginAs`), audit_logs (from the `@Audit()`-decorated
PUT calls), users, then the school itself, in FK order — full teardown,
nothing left behind. The four purely-read-only GET tests (verifying the
real seeded structure loads correctly) and the "TEACHER cannot PUT" test
(a `RolesGuard` rejection before any tenant logic runs) still use the real
seeded tokens — they're genuinely harmless and worth keeping as a live
check that seed.ts's own baseline is intact.

**Not fixed, flagged for a follow-up**: `grade-boundaries.e2e-spec.ts` has
the identical structural issue (also school-wide, also PUTs the real
Sunrise tenant directly, also tries to restore via a real PUT in
`afterAll`) — out of scope for this fix (only asked for the assessment-
components file), but the exact same scratch-school pattern applies
directly if/when it's worth doing.

**Also noticed, not fixed** (out of scope — only `requiresApproval` was
reported broken): `maxScore` has the identical latent defaulting bug
(`item.maxScore ?? 100` in the same `replaceAll`, also absent from the
frontend form entirely) — currently harmless only because every seeded
component already happens to use its default maxScore, so no edit has yet
observably reset one. Worth the same treatment if a school ever
configures a non-default maxScore.

**Proof**: 4 new Vitest tests in `AssessmentStructurePanel.test.tsx`
(weight-only edit preserves each component's flag — the exact failing
walk case, reproduced; requiresApproval included in the save payload;
toggling the checkbox round-trips; unchecking every box blocks save
client-side with the Q7 message, no PUT ever fires) — 151 total, up from
148. `assessment-components.e2e-spec.ts` unchanged in count (13 tests)
but now scratch-school-isolated; full backend e2e suite (298) unaffected.
Live re-verification of the exact walk failure: the CA1 −1 / CA2 +1
weight nudge now saves successfully end to end on a fresh stack.

## 2026-08-19 — v0.5.1 step 1: subject-for-a-class rule + forced teacher assignment (SPEC_V0.5.1.md §2.1/§2.2)

**Rule**: a subject exists for a class only once a `subject_teacher_assignment`
exists for that exact (subject, class arm, session). One shared helper,
`getAssignedSubjectMap` (`apps/api/src/grades/subject-assignment.util.ts`),
is the single source of truth for "which subjects are assigned to this
class arm this session" — used by `assertTeacherAssignment` (grid entry
gate), `getClassArmResults`/`getReview`/`getStudentResults`/`getReportCard`
(the `needsTeacherAssignment` flag), and `ClassArmsService.findOne` (the
Classes tab's `subjectTeachers`, refactored to it with no behavior change).
One query shape, so the four surfaces can't drift against each other.

**2.2 turned out to already be structurally satisfied**: `POST
/subject-assignments` (the only real "add a subject to a class" action —
`SubjectClassLevel`/`PUT /subjects/:id/levels` is a separate, teacher-free,
level-wide curriculum-eligibility concept, left untouched) already requires
a `teacherUserId` — schema `NOT NULL`, DTO required. The actual gap was
`assertTeacherAssignment`'s admin/proprietor bypass: `SCHOOL_ADMIN`/
`PROPRIETOR` could grade ANY (subject, class arm) pair via `ScoreEntryGridPage`'s
free dropdowns regardless of assignment — the real mechanism by which new
orphans got created. Closed by extending the check to admin/proprietor too
(existence-only — any teacher, not "is it me" like the `TEACHER` branch),
throwing `404` ("No teacher is assigned to teach this subject for this
class"), not `403` — this isn't a permission distinction, it's "this
pairing isn't gradeable," matching the "hidden, not forbidden" framing used
everywhere else this rule applies. The `TEACHER` branch's existing `403`
is unchanged.

**Q1(b) (existing graded-but-unassigned data)**: never hidden, only
flagged. Falls out for free: overview/review/student-results/report-card
already only ever list subjects with a real `term_subject_result` row, so
there's nothing to "hide" there regardless — `needsTeacherAssignment:
boolean` just gets added to each row. The only place with genuine
hide-as-an-option behavior is the entry picker (`ScoreEntryGridPage`'s
Subject dropdown), which now sources its options from
`GET /class-arms/:id`'s `subjectTeachers` (already correctly assignment-
filtered — same data that backs the Classes tab's "Enter grades" links)
instead of the previously-unfiltered `GET /subjects`. No migration/backfill
needed — the seeded Sunrise data has zero graded-orphan rows (only
Mathematics/English are ever scored in seed.ts, both backed by real
`seedSubjectTeacherAssignments` rows).

**Frontend**: `ScoreEntryGridPage`'s admin/proprietor Subject select is
now populated from `useClassArmDetail(classArmId, 1, 1)` once a class is
picked (reusing the existing endpoint rather than adding a new one —
flagged as a Step 3 revisit candidate if the entry-grid picker gets
reworked anyway, since fetching a full `ClassArmDetail` just for its
`subjectTeachers` is more than this picker strictly needs). Picking a
different class clears a previously-picked subject (a ref-tracked "did
classArmId actually change since mount" guard, not naive `useEffect` on
every render, to avoid clobbering a URL-seeded `?subjectId=` pair from an
"Enter grades" link on first load). A `"Needs a teacher assigned"` badge
(`StatusBadge`, `warning` tone) renders next to the subject name on
Overview, Review, the Results tab, and the report card wherever
`needsTeacherAssignment` is true.

**Not touched (flagged, not this step)**: `AddSubjectTeacherDialog`'s own
Subject dropdown (`useAllSubjects()`) is unfiltered by class level — you
can pick a JSS-only subject when assigning a teacher to an SSS arm. Not
what 2.1 or 2.2 asked for; a candidate for a later step. Also,
`GET /students/:id/report-card` (and its `remarks/*` write endpoints) were
never documented in `docs/API.md` at all — a pre-existing gap from v0.5
step 4/6 that predates this step; only patched enough here to not leave a
dangling "see below" reference for the new field, not written up in full.

**Test hygiene fallout**: closing the admin bypass broke seven *existing*
e2e specs that scored an admin-created scratch subject without ever
creating an assignment for it (`grades-grid`, `grades-publish`, `terms`,
`report-card`, `student-results`, `class-arm-results`, `grades-review`) —
expected, since they were implicitly relying on the bypass this step
deliberately removes. Fixed by having each file's own `score()`/
`scoreComponent()` helper upsert a `subjectTeacherAssignment` for whatever
(subject, class arm, session) it's about to write to (idempotent, keyed on
the real `@@unique([subjectId, classArmId, sessionId])`) — one line per
file, no per-call-site tracking needed. Two files (`student-results`,
`class-arm-results`) have a specific "this subject is taught by nobody
assigned to the CALLING teacher" test fixture; those got an explicit
assignment to a different, already-full-access teacher (the class-teacher)
instead of the generic upsert, to keep that fixture's actual point intact
rather than accidentally assigning the exact teacher the test is proving
doesn't teach it.

**Proof**: new `subject-for-a-class-rule.e2e-spec.ts` (4 tests, scratch
bundle per SPEC_V0.5.1.md's own Q1(b) scenario, `createScratchBundle`
pattern) — unassigned pair rejected (404 admin/proprietor, 403 teacher);
assigning makes it appear in class-arm detail and gradeable for all three
roles; an already-graded orphan (assignment created → scored → removed via
the real `DELETE /subject-assignments/:id`) stays visible with
`needsTeacherAssignment: true` across overview/review/student-results/
report-card and re-clears once reassigned; cross-tenant 404. Plus 7 new/
updated Vitest cases (`ScoreEntryGridPage` admin picker scoping — 3 new;
`ClassArmResultsView`/`ReviewPublishPage`/`ReportCardPage`/
`StudentResultsTab` badge rendering — 4 new). Full `pnpm run ci` (typecheck
+ lint + all 27 e2e suites/302 tests + 29 web Vitest files/158 tests + unit)
green on a fresh `docker compose down -v` → migrate → seed database;
`docker compose up -d --build` boots the full stack from scratch
(api + web images rebuilt, `/health` returns `{"status":"ok","db":true,"redis":true}`).

## 2026-08-19 — v0.5.1 step 2: teacher visibility scoping (SPEC_V0.5.1.md §2.4)

**Rule**: a `TEACHER`'s Classes list (`GET /classes`) and class-arm detail
(`GET /class-arms/:id`) are scoped to arms they're the class-teacher of or
hold a subject assignment in this session — Q3's approved definition.
`SCHOOL_ADMIN`/`PROPRIETOR` unchanged, both endpoints. This is visibility
only: grade access (`getClassArmResults`/`getStudentResults`/
`getReportCard`/grid entry) already enforced the identical relationship
before this step and none of it changed.

**Single-sourced, not a second definition**: `resolveTeacherAccess`
(previously private to `GradesService`) is extracted to
`apps/api/src/grades/teacher-access.util.ts` verbatim — same signature
shape (now a params object instead of positional args), same behavior,
same four call sites inside `GradesService` unaffected. Alongside it,
`resolveTeacherArmIds` — the "list every arm this teacher touches" form
`GET /classes` needs — is built on the exact same two queries
(`classTeacherAssignment`/`subjectTeacherAssignment`, just not narrowed to
one arm), so "a teacher's classes" for visibility and "a teacher's access"
for grades can't drift into two different rules over time.

**Branch, not a scope parameter**: both `ClassesService.findAll()` and
`ClassArmsService.findOne()` take the exact same query path for
`SCHOOL_ADMIN`/`PROPRIETOR` as before this step — the `TEACHER` case is an
early branch, not a filter threaded through the shared query. Confirmed
via the existing `GET /classes` "constant query count, not N+1" e2e test,
which asserts on the admin token and is unaffected (no extra queries run
on that path at all).

**Class-arm detail 403, not 404** (Flag 1): a `TEACHER` requesting an arm
they don't teach gets `403 "You are not assigned to this class."` —
verbatim reuse of `getClassArmResults()`'s existing message for the
identical situation, not a new one. Matches the standing convention in
this codebase: `403` for a same-tenant relationship gap, `404` reserved
for cross-tenant/nonexistent. A missing current session also naturally
`403`s a teacher (no session means no assignment can exist) rather than
needing a special case. The Classes list has no equivalent "which
resource" question — a teacher with zero assignments gets `200 []`, same
pattern as `ScoreEntryGridPage`'s existing empty-assignments state.

**`GET /students`/Global Search deliberately left untouched** (Flag 3):
2.4's own wording ("Classes list and student visibility... within those
classes they teach") reads as the class-arm roster, not the general
student directory — and `GET /students/:id`'s non-scoping is already
documented (`docs/API.md`) as a deliberate v0.1 decision, not a gap.
**Flagged for Dami, not decided here**: `GET /students` is what Global
Search hits directly (`use-global-student-search.ts`) — a teacher can
currently find and open any student in the school from the sidebar search
box, same as before this step. Whether that should narrow to a teacher's
own students too is a product call his re-pass (which was specifically
about opening a class and seeing its roster) didn't ask for — surfacing it
here rather than silently scoping or silently leaving it.

**Test hygiene**: every seeded Sunrise teacher already gets round-robined
into a class-teacher assignment across ALL real arms by
`seedClassTeacherAssignments` — none of them are safe "sees nothing"
fixtures against live seed data. The new spec creates one dedicated
teacher user with zero assignments anywhere (mirrors the scratch-
proprietor pattern from `grades-publish.e2e-spec.ts`), then builds three
scratch arms (class-teacher/subject-teacher/unrelated) to get an exact,
uncontaminated assertion.

**Proof**: new `teacher-visibility.e2e-spec.ts` (6 tests: empty list for a
zero-assignment teacher; `GET /classes` returns exactly the class-teacher
+ subject-teacher arms, never the unrelated one, and never an empty-arms
level; `GET /class-arms/:id` 200s with full roster for both; 403s for the
unrelated arm with the exact message; admin/proprietor see all three arms
unfiltered; cross-tenant 404 both directions). Plus 2 new web Vitest cases
(`ClassesPage` renders only a teacher-scoped mock response's arms;
`ClassArmDetailPage` surfaces the 403 as a readable sentence, not a
crash). Full `pnpm run ci` (typecheck + lint + 28 e2e suites/308 tests +
29 web Vitest files/160 tests + unit) green on a fresh
`docker compose down -v` → migrate → seed database (no new migration —
this step is queries/logic only); `docker compose up -d --build` boots
the full stack from scratch, `/health` reports `db: true, redis: true`.

## 2026-08-22 — v0.5.1 step 3: Enter-grades locked to class+subject (SPEC_V0.5.1.md §2.3)

**Rule**: class + subject are locked to whichever "Enter grades" link the
caller arrived through — rendered as a read-only label ("JSS 1 A ·
Mathematics"), never a picker. Component and term stay real, interactive
selects (they vary per grading job; class/subject roaming was the actual
disorganization finding 2.3 fixes). Pure frontend — no migration, no DTO
change, no new e2e; `GetGradesGridQueryDto`/`SaveGradesGridDto` already
required both as UUIDs, and `assertTeacherAssignment` (step 1) already
gates every combination regardless of how the page got there.

**Every real entry point already carried both params**: `ClassArmDetailPage`
(admin/proprietor, `canManage`-gated) and — found during research, not
previously called out in any spec — `MyClassesView`'s "Subjects I teach"
table (the teacher's actual entry point, already link-based). There is no
sidebar nav item pointing at `/grades/grid` bare for either role. This is
what let the fix be a straight removal, not a redesign: `useClasses()`,
the admin free Class+Subject dropdowns, and the teacher's own scoped-but-
still-a-dropdown "Class & subject" select (fed by `useMyTeaching`, and
itself a Step 1 addition once Step 1 correctly scoped its options) are all
deleted outright — `MyClassesView` was already the correct, already-scoped
teacher flow, so removing its parallel dropdown loses nothing.

**Label resolution reuses `useClassArmDetail`**, now for BOTH roles (Step 1
had it admin-gated, feeding dropdown options; step 3 uses the exact same
fetch purely to read two display strings — `classLevel.name`+`name` and a
`subjectTeachers` lookup by `subjectId`). Heavier than a two-string label
strictly needs (it also pulls a page of students, unused here) — the same
"revisit if the picker gets reworked" note from Step 1's DECISIONS.md entry
anticipated this exact moment; not addressed now, since a dedicated
lightweight endpoint wasn't asked for and the existing one is already
proven correct and multi-tenant-safe.

**Bare-route redirect is role-aware** (Flag 1): `/grades/grid` with no
`classArmId`/`subjectId` `navigate()`s with `{ replace: true }` — to
`/dashboard` for `TEACHER` (renders `MyClassesView`, their real Enter-
grades source) and `/classes` for `SCHOOL_ADMIN`/`PROPRIETOR` (whose
Enter-grades action lives on `ClassArmDetailPage`, one click away).
Deliberately NOT the same target for both: a teacher's own
`ClassArmDetailPage` view has no Enter-grades action at all (`canManage`-
gated), so sending a teacher to `/classes` would just relocate the dead
end one page later instead of fixing it. Waits for `currentUser` to
resolve before firing, so the redirect target is never guessed wrong
during the brief window before `/auth/me` returns.

**The lock is UX, not the security boundary** (explicit refinement): a
hand-edited URL to an unassigned/unauthorized class+subject still 404s
(admin/proprietor) or 403s (teacher) via `assertTeacherAssignment`,
exactly as before this step — `ScoreEntryGrid`'s existing generic error
branch (`getErrorMessage` + Try again, unchanged code) already rendered
this cleanly; step 3 adds no new handling for it, just proves it still
works once the picker in front of it is gone. A separate, genuinely new
failure mode this step introduces: `useClassArmDetail` itself can now
reject (a stale link to a class the teacher lost access to, via step 2's
403) — that gets the same clean full-area error treatment as every other
page in this app that guards on a single resource fetch.

**Proof**: `ScoreEntryGridPage.test.tsx` rewritten (8 tests, replacing the
now-deleted dropdown-scoping tests from step 1): bare-route redirect for
both roles (via the real `<AppRoutes>` tree, `ChangePasswordFlow.test.tsx`'s
pattern, since the target depends on real sibling routes) confirms neither
lands on a picker; locked label renders as plain text for both roles with
zero `<select>`/labelled-Class-or-Subject elements anywhere (asserted via
`getAllByRole("combobox")` having length exactly 2 — Component + Term);
Component/Term remain real, interactive selects and successfully load the
grid; the 404 (admin) and 403 (teacher) params-rejected shapes both render
the clean existing error state; a stale-link 403 from `useClassArmDetail`
itself replaces the whole area with its own clean error. Full `pnpm run ci`
(typecheck + lint + 28 e2e suites/308 tests, unchanged — no backend touched
— + 29 web Vitest files/164 tests + unit) green on a fresh
`docker compose down -v` → migrate → seed database; `docker compose up -d
--build` boots the full stack from scratch, `/health` reports `db: true,
redis: true`.

## 2026-08-22 — v0.5.1 step 4: mark absent after publish (SPEC_V0.5.1.md §2.5)

**Reuses `saveGrid` directly — no new endpoint, no parallel recompute.**
The fix is the PUBLISHED-student gate in `GradesService.saveGrid()`: it now
lets `SCHOOL_ADMIN`/`PROPRIETOR` pass (existence-tracked in a new
`bypassedPublishedStudentIds` set), where before it 409'd everyone
unconditionally. `TEACHER` still hits the exact same 409 as before this
step. The term-closed check earlier in the same transaction is completely
untouched — the published-lock bypass does not (and must not) extend to
the closed-term gate; a closed term still needs the unlock flow first,
admin included. Same fixed lock order as always (term → subject →
conditional class-arm, `lock-keys.ts` unchanged) — the class-arm lock's
condition is simply broadened to also fire when a bypass happened,
alongside the pre-existing gap-#2 condition.

**The one real design fork**: `recomputeStudents()` has always reverted
ANY recomputed row to DRAFT/PENDING_APPROVAL and nulled
`subjectPosition`/`publishedAt` — correct for every existing caller,
because nothing could previously reach a recompute while PUBLISHED at all
(the very gate this step opens). Calling it unmodified on a bypassed row
would silently un-publish the correction, contradicting the whole point.
Fixed with one additive, optional parameter —
`preservePublishedStudentIds` — that, only for students genuinely
PUBLISHED before this write, forces `status: PUBLISHED` and keeps the
ORIGINAL `publishedAt` (this corrects data, it isn't a new publish event).
Every other caller (`saveGrid`'s normal path, `recompute()`, `unpublish()`)
passes nothing and is byte-for-byte unaffected — confirmed by the full
existing e2e suite passing unchanged.

**Why unconditional preserve, not conditional-on-completeness** (a
divergence from the approved plan worth stating explicitly): the plan
considered a completeness-break-→-revert path — if the correction left the
subject incomplete, fall back to the normal recompute instead of forcing
PUBLISHED. That path is provably unreachable, so it was dropped rather than
implemented dead. An absent-correction can never reduce subject
completeness: "absent" is a decided component state (v0.5 step 1), so
marking absent or correcting back only ever keeps a component decided — it
can never make one undecided (only clearing a cell does that, which this
operation never does). A subject complete enough to have been published
therefore stays complete after any absent-correction, so the row is always
safe to keep PUBLISHED — hence `preservePublishedStudentIds` forces
PUBLISHED unconditionally rather than checking completeness first.

**The subject-wide re-rank is new code, but not a new algorithm**: a
bypassed student's total moving can shift every OTHER published student's
relative rank in that subject too, not just theirs, so `saveGrid` now runs
the identical `computeStandardCompetitionRanking` pass `publish()` already
does (same call, copied to a new call site) whenever a bypass occurred —
still under the subject lock already held, no new lock. `recomputeOverallForClassArm`
(unmodified) then cascades the same change across subjects via the
existing class-arm lock.

**UI location — an explicit design question, not assumed**: the spec's own
implementation note says "a UI control on the review/overview screen," and
the score-entry grid client-side hard-locks any `PUBLISHED` row regardless
of role (`ScoreEntryRow.tsx`'s `isLocked`) — unlocking that cell for admin
would have repurposed the grid Step 3 just locked to a specific class+
subject into a correction workflow it wasn't designed for. Asked Dami
directly rather than guessing; confirmed: a new "Correct a published
result" control (`UserX` icon, next to the existing Override pencil icon)
on `ClassArmResultsView`/Overview, opening `MarkAbsentDialog` — picks a
component (Overview only shows the subject total, not a per-component
breakdown), loads that cell's current value via the same `GET /grades/grid`
the entry grid itself uses, and submits through `useCorrectPublishedScore`
→ `PUT /grades/grid` with a single-item `scores[]`. No admin/proprietor
asymmetry (`canMarkAbsent` is a plain boolean, unlike override's `pendingOnly`/`any`
split) — the button only ever appears on an already-PUBLISHED row (a
non-published row's absence is already freely editable through the normal
grid).

**Test hygiene**: one pre-existing `grades-grid.e2e-spec.ts` test asserted
that even `admin@sunrise.test` got 409'd writing to the real, seeded
PUBLISHED JSS 1 A English result — now factually the wrong expectation for
admin. Fixed by switching that specific assertion to the English subject's
actual TEACHER token (`teacher2@sunrise.test`), which is exactly who this
lock still blocks; the sibling `POST /grades/recompute` published-lock test
right below it was untouched (that endpoint has no bypass — this step is
scoped to `saveGrid` only) and needed no change.

**Proof**: new `mark-absent-after-publish.e2e-spec.ts` (7 tests, scratch-
bundle isolated): admin marks a published student absent — total drops,
subject AND overall position recompute for the WHOLE 3-student cohort (not
just the touched student), stays PUBLISHED with the ORIGINAL `publishedAt`,
audited with the bypass explicitly named in metadata; admin then corrects
back to a real score — symmetric restore; TEACHER 409s on both directions,
unchanged; a CLOSED term still blocks the correction pending unlock, then
succeeds once unlocked (proves the bypass never leaks into the closed-term
gate); a hand-crafted both-set `student_scores` row still violates the DB
CHECK constraint; a concurrent admin correction (subject A) and a publish
of a different subject (B) on the same class arm don't deadlock and both
land consistently; cross-tenant 404. Plus new `ClassArmResultsView.test.tsx`
cases (button visibility: published-only, no admin/owner split, calls
back with the right target) and a new `MarkAbsentDialog.test.tsx` (7
tests: prefill from the current cell, absent vs. score submission payloads,
backend-rejection message surfaced, Save disabled until a component is
picked). Full `pnpm run ci` (typecheck + lint + 29 e2e suites/315 tests +
30 web Vitest files/175 tests + unit) green on a fresh `docker compose
down -v` → migrate → seed database (no new migration); `docker compose up
-d --build` boots the full stack from scratch, `/health` reports `db:
true, redis: true`. No live browser check this step either — the
scratchpad's Playwright install is still broken (missing `package.json`
under its `node_modules/playwright`), noted rather than silently skipped.
