# ScholaMetric — Backlog

## Deferred / known issues

## v0.9.1: local e2e hangs with zero DB connections at 0% CPU — needs a LIVE capture, not a v0.9 blocker
Across the v0.9 Step 1/2b/2c flake-hunt, 4 of 6 local hard-timeout hangs showed the Node
process sitting at 0% CPU for minutes with **zero** Postgres connections open at kill time —
not a database wait in any form. CI's own backend e2e suite shows 0/50 failures in the same
window (same pool size as the failing local arms), so this is local-environment-specific, not
a shipped defect, and is explicitly not a v0.9 blocker (see docs/SPEC_V0.9.md §2 acceptance,
revised 2026-11-23). Ruled out: "second-connection acquisition shrinking the pool" (no excess
connections found in any dump), `FakeStorageService` (synchronous, no I/O), `AuditInterceptor`
(correct RxJS usage). Jest's own 30s per-test timeout is a real timer that would still fire if
the hang were simply one abandoned promise inside a normal test — it didn't, ruling that out
too. **Two named suspects, neither confirmed**: (a) macOS process suspension/throttling (App
Nap) or Docker Desktop pausing, which would freeze the whole process including its own
internal timers; (b) the flake-hunt harness's own custom Jest reporter
(`~/flake-hunt-data/reporter.js`, not part of this repo) doing a synchronous `execSync`
`docker compose exec ... psql` shell-out at every file boundary — confirmed every PROVE arm
ran with this reporter attached, and Node's `execSync` timeout option isn't airtight against
every way a wrapped Docker/psql call can hang. **v0.9.1 task**: capture a LIVE stack at the
moment of a hang, not a post-mortem log — e.g. `sample <pid>` (macOS) and
`ps -o state,wchan -p <pid>` taken *before* killing the process, run once without the custom
reporter attached to isolate suspect (b). Full findings: `~/flake-hunt-data/FINDINGS.md`.

**2026-11-25 — live data point supporting suspect (a).** A `pnpm run test` launched during
v0.9 Step B's PROVE sat overnight (elapsed `01-00:47:38`, only `2:09.67` of actual CPU time —
the host machine slept). `sample <pid>` before killing it showed the main thread genuinely
idle in `uv__io_poll` → `kevent`, every worker thread parked on a semaphore/condvar wait — not
blocked in a syscall, not spinning, just waiting for an I/O event that never arrived while the
OS had the process suspended. This is a live demonstration of the EXACT signature (0% CPU,
event loop idle, no forward progress) suspect (a) predicts macOS suspension would produce on
this process, including its own internal timers — not a reproduction of the original few-
minutes-long local flake (this one ran a full day, an obvious sleep/lid-close, not an ambiguous
short stall), but it confirms the mechanism is real and produces exactly this shape of hang,
making (a) the more plausible of the two suspects. Still doesn't rule out (b).

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
