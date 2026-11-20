# ScholaMetric — Backlog

## Deferred / known issues

## e2e test database never resets between local runs — FIXED (v0.9 Step 2a, 2026-11-19)
`apps/api/test/global-setup.ts` only created `scholametric_test` if it didn't already exist,
then ran `migrate deploy` + `db seed` — it never truncated existing rows. Across many local
`pnpm test` runs in one long-lived dev environment, this let state accumulate (e.g. extra
students from earlier runs whose fixtures weren't cleaned up), and `me-student.e2e-spec.ts`
hit this directly: a local full-suite run failed with a `(school_id, admission_number)`
unique-constraint violation, while running that same file in isolation immediately after hit
a *different* Prisma error — two different failures on identical, unchanged code is the
signature of stale row state, not a regression (confirmed: that file hasn't been touched
since v0.7.4, zero diff across any v0.8.5 commit). CI stayed green throughout on its own
always-fresh database. Noted during the v0.8.5 health check (2026-11-12); independently
confirmed as a major, real cause of flakiness during the v0.9 Step 1 flake-hunt (a dedicated
no-reset-between-runs arm produced 100-260 failed tests per run in half its runs).
**Fixed**: `global-setup.ts` now drops (`WITH (FORCE)`) and recreates `scholametric_test` on
every run, guarded by `assertIsTestDatabaseUrl()` (unit-tested) so this destructive step can
never target anything else. Proved with 5 back-to-back full-suite runs, no manual reset
between them — zero stale-state failures (docs/DECISIONS.md, 2026-11-20).

## School-local "today" for date rules (timezone correctness)
The backend computes "today" in UTC (CalendarService / the lesson isDateInTheFuture check and
homework's minDate=today). Schools are WAT (UTC+1, no DST), so for the first hour after local
midnight, server-UTC "today" lags school-local "today" by a day: a teacher logging today's
lesson at ~00:30 WAT sends the local date, the backend reads it as the future and 400s it —
a spurious nightly-window rejection. Homework's minDate=today touches the same convention from
the other side. Fix = timezone-aware (school-local) date resolution for the date rules, applied
to both lessons and homework. Not scheduled to a version yet. Surfaced only because a v0.8.4
Step 3 PROVE ran locally in Paris-evening (23:45 UTC); CI runs in UTC and never catches it.

## v0.8.5 — TAGGED (2026-11-12, commit 0fdeb0a)
Session persistence + auth hardening. Shipped as planned below, plus a real reload bug the
walk caught that the plan didn't anticipate: the refresh cookie's `Path` was `/auth`, but the
API's global prefix means the real route is `/api/v1/auth/refresh` — `/auth` was never a
prefix of that path, so the browser never attached the cookie back on refresh at all (RFC
6265 path-matching; e2e/curl both missed it because they forward the cookie by hand). Fixed
by correcting the shared `REFRESH_COOKIE_PATH` constant to `/api/v1/auth` and adding a
regression guard that asserts the Set-Cookie path actually matches the mounted route, not
just a hardcoded literal. See docs/DECISIONS.md (2026-11-11) for the full writeup.

Original plan, for reference:

Two items, found while diagnosing "a full page refresh logs the user out" (not a bug — tokens
are deliberately memory-only with zero boot rehydration, a documented v0.1 decision trading
session persistence for zero persistent, XSS-exfiltratable browser credentials):

1. **httpOnly-cookie refresh token** — replaces the memory-only/no-rehydration v0.1 decision.
   Survives a reload without reintroducing the script-readable long-lived credential
   `localStorage` would. Needs: silent refresh on boot (exchange the cookie for a fresh access
   token before protected routes render), `Set-Cookie` on login/refresh instead of a body
   field, `SameSite=Lax`, and CSRF consideration since a cookie is now in play.
2. **Fix the refresh-rotation family-revocation race** — `AuthService.refresh()` revokes a
   user's whole refresh-token "family" on reuse detection via a read-then-write (no atomic
   guard), so a losing concurrent call can revoke a winning call's brand-new token moments
   after issuing it (confirmed live: two concurrent `/auth/refresh` calls with the same token —
   one got 200 + a new token, the other got 401 and revoked the family, and the "winning"
   new token was then also dead). Fix = an atomic conditional update
   (`UPDATE ... WHERE id = row.id AND revoked_at IS NULL`, checking the affected-row count)
   instead of the current read-then-write. Independent of item 1 — worth fixing regardless of
   which persistence option ships.

Both shipped in v0.8.5 (tagged above) — item 2 as the per-chain `family_id` + atomic rotation
rework, not the simpler single-row guard originally sketched here.
