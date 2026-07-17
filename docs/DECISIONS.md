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
