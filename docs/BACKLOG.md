# ScholaMetric — Backlog

## Deferred / known issues

## School-local "today" for date rules (timezone correctness)
The backend computes "today" in UTC (CalendarService / the lesson isDateInTheFuture check and
homework's minDate=today). Schools are WAT (UTC+1, no DST), so for the first hour after local
midnight, server-UTC "today" lags school-local "today" by a day: a teacher logging today's
lesson at ~00:30 WAT sends the local date, the backend reads it as the future and 400s it —
a spurious nightly-window rejection. Homework's minDate=today touches the same convention from
the other side. Fix = timezone-aware (school-local) date resolution for the date rules, applied
to both lessons and homework. Not scheduled to a version yet. Surfaced only because a v0.8.4
Step 3 PROVE ran locally in Paris-evening (23:45 UTC); CI runs in UTC and never catches it.

## v0.8.5 plan: session persistence + auth hardening
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

No code yet — both deferred to v0.8.5.
