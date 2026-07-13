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
