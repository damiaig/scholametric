export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const BCRYPT_COST = 12;

// v0.8.5 step 1 (SPEC_V0.8.5.md §2) — the refresh token moves from the
// response body into an httpOnly cookie, scoped to /auth only (never sent
// on every API call) so a stolen access-token request can't also carry it.
export const REFRESH_COOKIE_NAME = "refreshToken";
export const REFRESH_COOKIE_PATH = "/auth";

// v0.8.5 step 1 (SPEC_V0.8.5.md §4) — defense-in-depth CSRF guard on top of
// SameSite=Lax: a forged cross-site POST to /auth/refresh|/auth/logout
// can't attach this custom header without a CORS preflight the API won't
// grant. Presence-only check — the exact value doesn't matter.
export const CSRF_HEADER_NAME = "x-requested-with";
