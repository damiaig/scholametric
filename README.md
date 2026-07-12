# ScholaMetric

Multi-tenant school management platform for Nigerian schools. See `CLAUDE.md`
for the project constitution and `docs/SPEC_V0.1.md` for the current version
spec (v0.1 — Foundation).

## Status

v0.1 step 2 (schema + seed): full Prisma schema, initial migration,
`PrismaService` + `TenantContext`/`forSchool` scaffolding (no consumers
yet), and the real seed script. No auth or domain endpoints yet — those
land in later steps of the v0.1 build order (see `docs/SPEC_V0.1.md` §6).

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
- Sunrise College (slug `sunrise`) with a SCHOOL_ADMIN, a TEACHER, a
  2026/2027 session (3 terms, first current), class levels JSS 1–SSS 3
  with arms A/B, and 25 students
- Hillcrest Academy (slug `hillcrest`), mirrored setup, 1 SCHOOL_ADMIN,
  5 students — kept deliberately separate for cross-tenant testing later

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
