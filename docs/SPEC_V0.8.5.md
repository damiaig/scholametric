# SPEC_V0.8.5 — "Session Persistence + Auth Hardening"

**Status:** DRAFT for approval. No code until the build order (§7) is approved.
**Theme (one):** make a logged-in session survive a page reload, done the secure way
(httpOnly-cookie refresh token), and fix a real refresh-rotation race — **auth/session only,
zero feature changes.**

**Depends on:** the existing v0.1 auth core (JWT access 15m / refresh 7d, rotation + reuse
detection, the module-level `refreshPromise` single-flight on the client, the
`PasswordChangeRequiredGuard`). This version **reverses** one deliberate v0.1 decision
(2026-07-13, DECISIONS.md:66-78): memory-only tokens with no boot rehydration, chosen then to
avoid any persistent browser credential. The requirement has changed — a school app used on
phones can't log everyone out on every refresh — and we now do it *without* re-accepting the
XSS risk that decision rejected.

**Two problems, both diagnosed, this version fixes both:**
1. **Reload logs you out** — currently *by design*, not a bug. Access + refresh tokens live
   only in a module-level in-memory variable (`auth-store.ts`); a reload wipes them and the
   route guard synchronously renders `/login`. No credential survives the reload.
2. **Refresh-rotation family-revocation race** (real latent bug) — reuse-detection revokes the
   user's *entire* active-token set (no per-chain `family_id`), so a losing concurrent or
   network-retried `/auth/refresh` revokes the token the winning call just legitimately
   issued. The race's loser poisons the winner.

---

## 1. Decisions locked (Dami)

- **Architecture:** refresh token → **httpOnly, Secure, SameSite cookie**; access token
  **stays in memory** (never persisted). Boot does a silent `/auth/refresh` behind a loading
  gate to re-mint the access token. (Not sessionStorage — that re-accepts a scoped version of
  the XSS risk the original decision rejected.)
- **Prod topology:** build for **same-site** (API served under the web origin, e.g.
  `app.<domain>` + `app.<domain>/api`) → `SameSite=Lax` + a custom-header CSRF guard. Dev is
  same-site already (`localhost`). Separate-domain prod (`api.<domain>`) is a deploy-time
  alternative needing `SameSite=None; Secure` + a double-submit CSRF token — noted in §8, not
  built now.
- **Keep genuine theft detection while fixing the race:** add a per-login-chain `family_id`,
  scope revocation to the chain (never all the user's tokens), and fire family-revocation
  only on *true* reuse of a superseded token — never on a benign race-loser.
- **Multi-device:** per-chain families → phone + laptop are independent sessions; logout or a
  theft-revocation on one never logs the other out.
- **Scope:** auth/session only. No feature, grade, homework, lesson, calendar, or
  multi-tenancy changes. JWT access-token *contents* unchanged. `/auth/login` throttle
  (10/min/IP) unchanged.

---

## 2. Cookie model

- **Login** (`POST /auth/login`): returns the **access token in the JSON body** (as today)
  AND sets the **refresh token as an httpOnly cookie**. The refresh token **no longer appears
  in the response body**.
- **Refresh** (`POST /auth/refresh`): reads the refresh token **from the cookie** (not a body
  field), rotates it, returns a **new access token in the body**, and sets the **new refresh
  cookie** (rotation ⇒ a fresh cookie every refresh).
- **Logout** (`POST /auth/logout`, NEW): clears the cookie (`Set-Cookie` maxAge 0) **and**
  revokes the current refresh chain server-side. Necessary because JS can't clear an httpOnly
  cookie.
- **Cookie attributes:** `httpOnly`, `SameSite=Lax`, `Secure` **in prod** (keyed off env —
  Secure cookies won't set over local http, so dev omits Secure; see §8 flag), **`Path`
  scoped to `/auth`** so the refresh cookie is sent only to the auth endpoints, not on every
  API call (smaller exposure + CSRF surface). Cookie `Max-Age` = the 7d refresh lifetime.
- The client's in-memory auth store **stops holding a refresh token entirely** — it's in the
  cookie, invisible to JS. Only the access token lives in memory. The existing module-level
  `refreshPromise` single-flight **stays** (client-side dedupe of concurrent refreshes).

---

## 3. Boot rehydration (the reload fix)

- The synchronous "`null` → render `/login`" gate is replaced by an **async tri-state auth
  status**: `unknown` → (silent refresh in flight) → `authenticated` | `unauthenticated`.
- On app boot, before protected routes render, call `POST /auth/refresh` **once** (the cookie
  rides along). While it's in flight, render a **loading/splash gate** (not the login screen,
  not the protected UI). Success → access token into memory → `authenticated` → render the
  app. Failure (no cookie / expired / revoked) → `unauthenticated` → `/login`.
- Protected queries (`useCurrentUser`, etc.) stay gated so they fire only once
  `authenticated` — they must not fire during `unknown`.
- Single-flight: the boot refresh and any request-triggered refresh share the one
  `refreshPromise`, so boot can't double-fire `/auth/refresh`.

---

## 4. CSRF

- `SameSite=Lax` already blocks the main vector: a cross-site `POST /auth/refresh|logout`
  won't carry the cookie. Defense-in-depth on top: the auth endpoints **require a custom
  request header** (e.g. `X-Requested-With`) that the client always sends — browsers won't
  attach it on a cross-site request without a CORS preflight the API won't grant, so a forged
  cross-site call is rejected even if SameSite were ever relaxed.
- **CORS must allow credentials:** the API sets `Access-Control-Allow-Credentials: true`
  (with an explicit allowed origin, never `*`), and the web sends every auth fetch with
  `credentials: "include"`. Without both, the cookie won't flow even in dev across ports.

---

## 5. Reuse detection + family rework (the race fix, security-preserving)

- **Add `family_id`** (per-login chain) to the refresh-token table. On **login**: mint a new
  `family_id` (chain root). On **refresh**: the rotated child stays in the **same family**.
- **Atomic rotation:** rotate via a single conditional write —
  `UPDATE refresh_tokens SET revoked_at = now() WHERE id = ? AND revoked_at IS NULL RETURNING …`
  and check the affected-row count. Exactly one concurrent call wins; the loser affects 0
  rows and fails **cleanly (401)** without touching the family.
- **Security invariant (both must hold):**
  - A **benign race-loser or network retry** (the same token presented twice while the chain
    hasn't advanced past its immediate successor) → **401, NO family revocation.** The
    winner's just-issued token stays valid. *(This is the diagnosed bug, now a passing test.)*
  - A **genuine reuse of a superseded token** (an already-rotated token presented after the
    chain has moved on — the hallmark of a stolen/replayed token) → **revoke the whole
    `family_id` chain.** Theft detection is preserved.
  - Recommended mechanism (Claude Code to finalize the exact columns at the Step-2 plan):
    record each token's successor (or a monotonic sequence within the family) so "was this
    token's successor already consumed?" is answerable — consumed ⇒ genuine reuse ⇒ revoke
    family; not-yet-consumed ⇒ benign race ⇒ 401 only.
- **Revocation is family-scoped**, never user-wide — so a theft-revocation or logout on one
  device never affects the user's other sessions.
- **Migration:** additive. Add `family_id` (+ the successor/sequence column the mechanism
  needs). Backfill each existing active token as its own single-token family. Hand-review the
  SQL (the trgm false-positive check prior migrations used).

---

## 6. What this does NOT touch
- No feature changes anywhere (grades, homework, lessons, calendar, portal, report cards).
- No multi-tenancy change — refresh tokens are already per-user within a school.
- JWT access-token contents + 15m lifetime unchanged; refresh 7d unchanged; rotation-on-every-
  refresh unchanged.
- `PasswordChangeRequiredGuard` and the `/auth/login` throttle unchanged.
- The client `refreshPromise` single-flight stays as-is (still correct, now also covers boot).

---

## 7. Build order (numbered — each = plan → approve → build → PROVE → commit → push → diff review)

*Step 1 reshaped to the cookie contract END-TO-END (backend + shared types + minimal frontend
consumption), atomic — no dev-breakage window between a backend-only Step 1 and a
frontend-only later step, and no "lying" shared type in between. Boot rehydration (the actual
reload-persistence fix) stays its own step, after the family_id rework. API via `pnpm run
start:dev`, web dev server fresh.*

1. **Cookie contract end-to-end: backend + shared types + minimal frontend consumption.**
   Refresh token leaves the JSON body → httpOnly `SameSite=Lax` cookie (Secure in prod,
   `Path=/auth`); `/auth/login` sets it, `/auth/refresh` reads (hand-parsed from the raw
   `Cookie` header — no `cookie-parser` dependency)+rotates+resets it, `/auth/change-password`
   (a third reissuing endpoint, found by sweeping every call site) does the same; the existing
   `POST /auth/logout` **reworked** (not new) to read the cookie instead of a body field,
   clear it, and revoke idempotently; the custom-header CSRF guard on refresh+logout only
   (never login) + CORS `credentials: true`. `packages/shared`'s `LoginResponse`/
   `RefreshResponse` drop `refreshToken` honestly (rebuilt dist). Frontend's consuming end
   only — NOT boot rehydration: `authStore` no longer holds a refresh token at all; login
   stores just the access token; the existing 401→refresh→retry path sends no body and the
   CSRF header, `credentials: "include"` on every fetch; logout the same way. Reload still
   logs out — unchanged behavior this step, by design (that's step 3's job). e2e: login sets
   the cookie not the body (httpOnly/Path=/auth/Max-Age asserted); refresh reads the cookie,
   rotates, sets a new cookie, returns a new access token; logout clears + revokes
   idempotently (old cookie then 401s); missing/garbage cookie → 401 (plus a dedicated cookie-
   value round-trip test for "=" and "." — never `split("=")`); a request missing the custom
   header → 403; no refresh token in any response body, anywhere. Reuse detection/rotation
   internals untouched (ported to cookies, not rewritten) — Step 2's job.
2. **`family_id` + atomic rotation + reuse-detection rework (backend).** Additive migration
   (backfill each token as its own family). The atomic conditional rotate + the two-branch
   reuse logic. e2e proving BOTH invariant halves: (a) genuinely-concurrent/retried refresh of
   the same token → one winner, loser 401, **family NOT revoked, winner's token still valid**
   (the diagnosed bug as a now-passing regression test — two real parallel calls, not a mock);
   (b) replay of a superseded token after the chain advanced → **whole family revoked**;
   (c) multi-device — two families for one user, revoking/logging-out one leaves the other
   fully working; (d) rotation + 7d expiry still hold.
3. **Boot rehydration (frontend) — the reload fix.** The async tri-state auth status +
   loading/splash gate on boot; the boot `/auth/refresh` (single-flight-shared, already in
   place since step 1); strip the memory-only/no-rehydration gate and the DECISIONS
   assumption. Web tests: boot gates on the refresh (loading → authenticated | login); a
   reload-persists path (refresh succeeds → app renders, no login flash); a failed boot
   refresh → login; protected queries don't fire during `unknown`.
4. **Walk + tag v0.8.5.** Fresh stack, the acceptance core: **log in → hard-refresh → still
   logged in** (the headline fix, and the one with no automated layout proof); **two browsers
   = two independent sessions**, logout on one leaves the other logged in; **the race** — hammer
   refresh / simulate a retry, you stay logged in; a **stale/replayed** refresh token is
   rejected; a normal 15-min access-token expiry silently refreshes without a logout. Update
   DECISIONS.md with the reversal of the 2026-07-13 memory-only decision + the new model. Then
   tag.

---

## 8. Flags consolidated (plan-time + resolved during step 1)
- **Secure cookie in dev:** Secure cookies won't set over local http → the cookie config must
  key Secure off env (Secure in prod/https, off in local http dev). Classic gotcha; get it
  right or dev auth silently breaks. **Resolved (step 1):** keyed off the existing
  `NODE_ENV` env var (already validated, no new var needed) — `secure: NODE_ENV ===
  "production"`.
- **CORS + credentials:** API `Access-Control-Allow-Credentials: true` with an explicit origin
  (never `*`) + web `credentials: "include"` on every auth call — both required for the cookie
  to flow, even dev cross-port (5173 → 3000). **Resolved (step 1):** `credentials: true` added
  to the existing `enableCors` call (it was missing entirely); `credentials: "include"` added
  unconditionally inside the frontend's shared `rawFetch` (harmless on non-auth calls — the
  cookie's own `Path=/auth` means it's never sent/received outside auth endpoints anyway).
- **Cookie Path:** recommend `Path=/auth` so the refresh cookie isn't sent on every API
  request. **Resolved (step 1):** built as `/auth`.
- **cookie-parser dependency:** CLAUDE.md requires asking before adding a library.
  **Resolved (step 1):** hand-parsed instead — the app only ever needs to read exactly one
  cookie. The parser finds the `refreshToken=` segment and takes everything after the FIRST
  `=` via `indexOf`/`substring` (never `split("=")`, which would truncate a value containing
  `=`), then `decodeURIComponent`s it (confirmed empirically: Express's own `cookie` package
  percent-encodes `=` to `%3D` when setting the cookie, so the raw wire value must be decoded
  back to match the stored hash). Unit-tested in isolation
  (`refresh-cookie.util.spec.ts`) and round-tripped against the real cookie-serialization
  path in `auth.e2e-spec.ts`.
- **A third reissuing endpoint, found by sweeping every call site:** `POST
  /auth/change-password` also calls `issueTokenPair()` (to clear the stale
  `mustChangePassword` claim) and returned `refreshToken` in its body — not named in this
  spec's original step-1 scope, caught by grepping every `refreshToken` reference across the
  codebase before building. Included in the cookie migration alongside login/refresh/logout.
- **Reuse-detection columns:** the exact successor/sequence design is recommended in §5;
  Claude Code finalizes it at the Step-2 plan — the fixed thing is the two-branch *invariant*,
  not the column layout.
- **Prod topology:** built same-site (SameSite=Lax + custom-header). Separate-domain prod
  needs SameSite=None;Secure + a double-submit CSRF token — a deploy-time decision, not built
  now; flagged so it's not forgotten at deploy.
- **PROVE must be real:** the reload-persistence (step 3) and concurrent/retried-refresh
  (step 2) paths are the two things never tested before — they must be exercised against the
  live stack, not just mocked, or this version hasn't done its job. Step 1's own PROVE (login
  → silent mid-session refresh via the cookie → logout) is exercised live too, not just unit-
  mocked — see DECISIONS.md.
- **`/auth/login`'s existing 10/min/IP throttle, unchanged:** `auth.e2e-spec.ts` already sat
  right at that exact boundary (10 real `login()` calls, no slack) before step 1's new
  coverage was added — every new refresh/logout/CSRF test added plants a `refreshToken` row
  or signs an access token directly instead of calling the throttled login endpoint, so
  coverage grew without touching the budget.

Auth/session only. The reload fix done the secure way (httpOnly cookie, no persistent
JS-readable credential), plus a genuine race fixed without weakening theft detection. Then
walk, then tag v0.8.5.
