# ScholaMetric — Project Constitution (CLAUDE.md)

This file is read by Claude Code at the start of every session. Nothing in this
repository may violate it. If a requested change conflicts with this document,
STOP and say so instead of implementing it.

---

## 1. What this project is

ScholaMetric is a multi-tenant school management platform for Nigerian schools
(nursery/primary/JSS/SSS), designed to eventually cover admissions, grading,
attendance, homework, messaging, report cards, and WAEC/NECO workflows.

Current phase: **v0.1 — Foundation** (see docs/SPEC_V0.1.md). Do not build
features from future versions unless explicitly asked.

---

## 2. Tech stack (fixed — do not substitute)

| Layer      | Choice                                              |
|------------|-----------------------------------------------------|
| Language   | TypeScript 5.x, `"strict": true` everywhere         |
| Backend    | NestJS 10 (REST, not GraphQL)                       |
| ORM        | Prisma (with raw SQL allowed for reports later)     |
| Database   | PostgreSQL 16                                       |
| Cache/queue| Redis 7 (BullMQ for background jobs — not in v0.1)  |
| Frontend   | React 18 + Vite + TypeScript                        |
| UI         | Tailwind CSS + shadcn/ui components, Lucide icons   |
| State/data | TanStack Query for server state; no Redux           |
| Auth       | Email + password with JWT (access 15m / refresh 7d).|
|            | Firebase Auth may replace this later — isolate auth |
|            | behind an `AuthService` so it is swappable.         |
| Validation | Zod on the frontend, class-validator DTOs on the API|
| Tests      | Vitest (frontend), Jest + Supertest (backend e2e)   |
| Containers | Docker + docker-compose for local dev               |

Do not add libraries beyond these without asking. No moment.js, no lodash
(use native), no axios (use fetch or NestJS HttpService).

---

## 3. Repository layout (fixed)

```
scholametric/
├── CLAUDE.md                  ← this file
├── docs/
│   ├── SPEC_V0.1.md           ← current version spec
│   ├── DECISIONS.md           ← append-only architecture decision log
│   └── API.md                 ← generated/maintained endpoint reference
├── docker-compose.yml         ← postgres + redis + api + web
├── apps/
│   ├── api/                   ← NestJS app (src/modules per domain,
│   │                             src/common for guards/filters,
│   │                             src/prisma, test/ for e2e)
│   └── web/                   ← React app (src/features per domain,
│                                 src/components/ui for shadcn,
│                                 src/components shared, src/lib, src/routes)
└── packages/
    └── shared/                ← shared types & Zod schemas (API contracts)
```
---

## 4. Multi-tenancy (the most important rule in this file)

- Every tenant is a **school**. Every domain table has a `school_id` column
  (FK → `schools.id`, `NOT NULL`, indexed). The only exceptions: `schools`
  itself and truly global tables (none exist yet).
- The authenticated user's `schoolId` comes from the JWT. It is **never**
  accepted from the request body, query string, or URL for scoping purposes.
- Every Prisma query on a tenant table MUST filter by `school_id`. This is
  enforced structurally: repositories/services receive a `TenantContext`
  (injected via a request-scoped provider) and there is a
  `forSchool(schoolId)` helper; direct un-scoped `prisma.student.findMany`
  style calls in domain modules are forbidden in code review.
- Every e2e test suite for a domain module MUST include a cross-tenant test:
  create data in School A, authenticate as School B, assert 404 (not 403 —
  do not leak existence).
- Unique constraints on tenant data are composite with `school_id`
  (e.g. `UNIQUE(school_id, admission_number)`), never global.

Violating tenancy is a data breach, not a bug. Treat it accordingly.

---

## 5. Backend rules

- Every endpoint requires authentication (`JwtAuthGuard` applied globally)
  except: `POST /auth/login`, `POST /auth/refresh`, `GET /health`.
  Public endpoints must be explicitly marked with a `@Public()` decorator.
- Authorization uses a `@Roles(...)` decorator + `RolesGuard`. Roles in v0.1:
  `SUPER_ADMIN`, `SCHOOL_ADMIN`, `TEACHER`, `PARENT`, `STUDENT`
  (only the first three are usable in v0.1; the enum ships complete).
- Every mutation endpoint has a class-validator DTO. No `@Body() body: any`.
- API responses use a consistent envelope:
  - Success: the resource or `{ items, total, page, pageSize }` for lists.
  - Error: `{ statusCode, message, error, path, timestamp }` via a global
    exception filter. Never leak stack traces or SQL.
- All list endpoints are paginated (`page`, `pageSize` ≤ 100, default 20)
  and support deterministic ordering (always a tiebreak on `id`).
- IDs are UUIDv7 (or UUIDv4 if v7 unavailable in the environment). Never
  auto-increment integers exposed to clients.
- Timestamps: every table has `created_at`, `updated_at` (UTC, `timestamptz`).
  Soft delete via `deleted_at` on user-facing records (students, users);
  all queries exclude soft-deleted rows by default.
- Migrations: Prisma Migrate only. Never edit an applied migration. Every
  migration must be runnable on a non-empty database (additive by default;
  destructive changes require an explicit note in `docs/DECISIONS.md`).
- Passwords: bcrypt (cost 12). Refresh tokens stored hashed, rotated on use.
- Log with Nest's Logger; include `requestId` and `schoolId` in log context
  via an interceptor. Never log passwords, tokens, or full request bodies.

---

## 6. Frontend rules

- Design tokens (Tailwind config):
  - Primary `#1E4ED8` (royal blue), Secondary `#059669` (emerald),
    Accent `#F59E0B` (gold — achievements only),
    Danger `#DC2626`, Warning `#EA580C`, Success `#16A34A`,
    Background `#F8FAFC`, Card `#FFFFFF`, Text `#111827`, Muted `#6B7280`.
  - Fonts: Inter (UI), JetBrains Mono (numeric/tabular data).
  - Icons: Lucide only. No emojis anywhere in the UI.
- Every page is responsive at 360px, 768px, and 1280px widths. Tables
  collapse to cards on mobile.
- Server state via TanStack Query only; no fetching in `useEffect`.
- Forms: react-hook-form + Zod resolver, using schemas from `packages/shared`.
- All user-facing errors are readable sentences, never raw API messages.
- Loading, empty, and error states are required for every data view.
  A page that only handles the happy path is incomplete.

---

## 7. Testing & definition of done

A task is done only when ALL of the following are true:

1. `pnpm typecheck` passes with zero errors in all workspaces (no `any`,
   no `@ts-ignore` without a comment explaining why).
2. `pnpm lint` passes.
3. Backend: e2e tests cover every new endpoint — happy path, validation
   failure (400), unauthenticated (401), wrong role (403), cross-tenant (404).
4. Frontend: the feature renders with mocked API in at least one Vitest test.
5. `docker-compose up` still boots the full stack from scratch, including
   migrations and the seed script.
6. `docs/API.md` updated for any endpoint change.
7. Anything surprising or decided along the way is appended to
   `docs/DECISIONS.md` (date, decision, reason — 3 lines max each).

---

## 8. How Claude Code must work in this repo

1. Read this file, then the current spec in `docs/`, then the relevant
   existing code. Never assume file contents — open them.
2. Before writing code, output a short plan (files to create/modify, schema
   changes, endpoints). Wait for approval only if the plan deviates from the
   spec; otherwise proceed.
3. Implement ONLY the requested scope. Do not refactor unrelated code,
   rename things for style, or "improve" working modules unasked.
4. Extend, never rewrite. Existing public APIs and DB columns are frozen;
   breaking changes require an entry in DECISIONS.md and explicit approval.
5. Run the test suite. Fix failures you caused. Do not delete or skip
   failing tests to make the build green.
6. Stop when the scope is complete. Summarize what changed and what the
   next logical step is. Do not start the next step.

---

## 9. Explicitly out of scope until their version

Mobile apps, offline mode, Firebase (any part), file uploads, payments,
messaging, timetables, report card PDFs, WAEC/NECO integration, analytics,
i18n. If asked to "prepare" for these, the only allowed preparation is
keeping module boundaries clean.