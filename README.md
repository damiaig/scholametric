# ScholaMetric

[![CI](https://github.com/damiaig/scholametric/actions/workflows/ci.yml/badge.svg)](https://github.com/damiaig/scholametric/actions/workflows/ci.yml)

Multi-tenant school management platform for Nigerian schools. See `CLAUDE.md`
for the project constitution, `docs/SPEC_V0.1.md` for the v0.1 (Foundation)
spec, and `docs/SPEC_V0.3.md` for the current version spec (v0.3 — The
Teacher's School).

## Status

**v0.3 in progress** (The Teacher's School): a teacher-facing "my teaching
load" endpoint, admin-configurable assessment components and grade
boundaries (atomic full-set replace, WAEC 9-point + simple A-F presets),
forced password change on first login / after a reset, and now CI via
GitHub Actions on every push and pull request to `main` (typecheck, lint,
and the full e2e/unit suite against real Postgres/Redis service
containers). v0.2 (Staff & Structure) and v0.1 (Foundation) remain fully in
place and covered by regression tests: school personnel/staff records
(`staff_profiles`, staff numbers), subjects and per-level subject offerings,
class-teacher and subject-teacher assignments (session-scoped), guardians
restructured into a many-to-many `guardians`/`student_guardians` model
(replacing the v0.1 flat guardian fields, which are frozen but still
populated for backward compatibility), a real audit-log-backed History tab,
session-activation safety (typed confirmation + enrollment-count preview),
and the Personnel/Teachers/Classes web UI, plus auth, schools, students,
sessions/terms/classes, and the dashboard. See `docs/DECISIONS.md` for the
full build history and `docs/API.md` for the endpoint reference.

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
| `pnpm run ci`     | typecheck && lint && test (note: `run`, not bare `pnpm ci` — that's pnpm's own reserved clean-install command) |

## CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`:
Postgres 16 and Redis 7 as health-gated service containers, `prisma migrate
deploy` + `pnpm seed` against them, then `pnpm run ci` (typecheck, lint,
and the full test suite — the API e2e suite runs with `--runInBand` and a
30s per-test timeout so bcrypt-cost-12 login hooks in `beforeAll` blocks
don't flake on shared runners). No deployment step yet — that's a
post-v1.0 concern.

## Repository layout

See `CLAUDE.md` §3 for the fixed repository layout this project follows.
