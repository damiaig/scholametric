export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const BCRYPT_COST = 12;

// v0.8.5 step 1 (SPEC_V0.8.5.md §2) — the refresh token moves from the
// response body into an httpOnly cookie, scoped to the auth endpoints only
// (never sent on every API call) so a stolen access-token request can't
// also carry it.
//
// v0.8.5 bugfix (docs/DECISIONS.md, 2026-11-11) — this MUST include the
// global prefix (`app.setGlobalPrefix("api/v1", ...)`, bootstrap.ts): the
// real mounted route is /api/v1/auth/refresh, not /auth/refresh. The
// original "/auth" value was never a prefix of that path at all, so the
// browser never attached the cookie to the refresh request — e2e/curl
// tests missed this because both forward the cookie by hand, bypassing the
// browser's own Path-matching entirely. Set (login/refresh/change-password)
// and clear (logout) both read this one constant so they can't drift apart.
export const REFRESH_COOKIE_NAME = "refreshToken";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

// v0.8.5 step 1 (SPEC_V0.8.5.md §4) — defense-in-depth CSRF guard on top of
// SameSite=Lax: a forged cross-site POST to /auth/refresh|/auth/logout
// can't attach this custom header without a CORS preflight the API won't
// grant. Presence-only check — the exact value doesn't matter.
export const CSRF_HEADER_NAME = "x-requested-with";
