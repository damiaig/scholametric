# Decisions log

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
