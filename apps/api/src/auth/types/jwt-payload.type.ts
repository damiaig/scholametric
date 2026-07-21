import type { UserRole } from "@prisma/client";

/** Access token claims. schoolId here is the sole source of tenant scoping (CLAUDE.md §4). */
export interface AccessTokenPayload {
  sub: string;
  schoolId: string;
  role: UserRole;
  // Read straight off this claim by PasswordChangeRequiredGuard — no DB hit
  // per request, same stateless-token philosophy as role/schoolId above.
  // Can lag up to the access token's lifetime after an admin resets someone
  // ELSE's password (see docs/DECISIONS.md); GET /auth/me always reads it
  // fresh from the DB regardless, so the frontend's primary signal is
  // unaffected — this claim is a defensive backstop, not the sole check.
  mustChangePassword: boolean;
}
