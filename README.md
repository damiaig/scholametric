# ScholaMetric

Multi-tenant school management platform for Nigerian schools. See `CLAUDE.md`
for the project constitution, `docs/SPEC_V0.1.md` for the v0.1 (Foundation)
spec, and `docs/SPEC_V0.2.md` for the current version spec (v0.2 — Staff &
Structure).

## Status

**v0.2 complete** (Staff & Structure): school personnel/staff records
(`staff_profiles`, staff numbers), subjects and per-level subject offerings,
class-teacher and subject-teacher assignments (session-scoped), guardians
restructured into a many-to-many `guardians`/`student_guardians` model
(replacing the v0.1 flat guardian fields, which are frozen but still
populated for backward compatibility), a real audit-log-backed History tab,
session-activation safety (typed confirmation + enrollment-count preview),
and the Personnel/Teachers/Classes web UI. v0.1 (Foundation) — auth, schools,
students, sessions/terms/classes, dashboard — remains fully in place and
covered by regression tests. See `docs/DECISIONS.md` for the full build
history and `docs/API.md` for the endpoint reference.

## Prerequisites

- Node.js >= 20
- pnpm 11.x (`corepack enable` will pick up the pinned version)
- Docker + Docker Compose

## Getting started

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

pnpm install
```

### Run everything in Docker

```bash
docker compose up -d
docker compose ps   # postgres + redis should report "healthy"
curl http://localhost:3000/health
```

Postgres is exposed on host port `5433` and Redis on `6380` (non-default, to
avoid clashing with any locally installed instances). The API listens on
`3000`, the web app on `5173`.

### Run the apps locally instead (two terminals)

```bash
pnpm --filter @scholametric/api start:dev
pnpm --filter @scholametric/web dev
```

This requires Postgres and Redis to be reachable (e.g. via
`docker compose up -d postgres redis`) and `apps/api/.env` pointed at them.

### Database: migrate + seed

With Postgres reachable (e.g. `docker compose up -d postgres`) and
`apps/api/.env` set (`DATABASE_URL=postgresql://scholametric:scholametric@localhost:5433/scholametric`):

```bash
pnpm --filter @scholametric/api exec prisma migrate dev   # applies apps/api/prisma/migrations
pnpm seed                                                  # runs apps/api/prisma/seed.ts
```

The seed is idempotent (upserts on natural keys) — safe to run more than
once. It creates:
- the platform school + `super@scholametric.test` (SUPER_ADMIN)
- Sunrise College (slug `sunrise`) with a PROPRIETOR, a SCHOOL_ADMIN, 8
  TEACHERs (with staff numbers, job titles, and subject/class-teacher
  assignments), 15 subjects across JSS 1–SSS 3, class levels JSS 1–SSS 3
  with arms A/B (class teachers assigned), a 2026/2027 session (3 terms,
  first current), and ~125 students with backfilled guardians (one student
  seeded with two guardians, to exercise the multi-guardian case)
- Hillcrest Academy (slug `hillcrest`), mirrored setup at smaller scale
  (1 SCHOOL_ADMIN, 2 TEACHERs, 5 students) — kept deliberately separate for
  cross-tenant testing

All seeded passwords are `Passw0rd!` (bcrypt cost 12).

**Adding a future migration that needs a partial index or a non-default
operator class** (e.g. more `pg_trgm` indexes): run
`prisma migrate dev --create-only` first and read the generated SQL
before applying — see `docs/DECISIONS.md` for why plain `migrate dev`
alone can silently propose dropping the existing trigram indexes.

## Scripts (run from the repo root)

| Script            | What it does                                      |
|-------------------|----------------------------------------------------|
| `pnpm typecheck`  | `tsc --noEmit` in every workspace                   |
| `pnpm lint`       | ESLint in every workspace                           |
| `pnpm test`       | Jest e2e (api) + Vitest (web) in every workspace    |
| `pnpm seed`       | Runs `apps/api/prisma/seed.ts` (idempotent)          |
| `pnpm ci`         | typecheck && lint && test                           |

## Repository layout

See `CLAUDE.md` §3 for the fixed repository layout this project follows.
