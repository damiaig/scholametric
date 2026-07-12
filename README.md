# ScholaMetric

Multi-tenant school management platform for Nigerian schools. See `CLAUDE.md`
for the project constitution and `docs/SPEC_V0.1.md` for the current version
spec (v0.1 — Foundation).

## Status

v0.1 step 1 (scaffold): monorepo, docker-compose, API health endpoint, web
login shell, `packages/shared` wiring. No database schema, auth, or domain
modules yet — those land in later steps of the v0.1 build order (see
`docs/SPEC_V0.1.md` §6).

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

## Scripts (run from the repo root)

| Script            | What it does                                      |
|-------------------|----------------------------------------------------|
| `pnpm typecheck`  | `tsc --noEmit` in every workspace                   |
| `pnpm lint`       | ESLint in every workspace                           |
| `pnpm test`       | Jest e2e (api) + Vitest (web) in every workspace    |
| `pnpm seed`       | Stub — real seeding lands in step 2                 |
| `pnpm ci`         | typecheck && lint && test                           |

## Repository layout

See `CLAUDE.md` §3 for the fixed repository layout this project follows.
