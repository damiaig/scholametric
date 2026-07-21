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
