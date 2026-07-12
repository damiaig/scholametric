import type { UserRole } from "@prisma/client";

/** Access token claims. schoolId here is the sole source of tenant scoping (CLAUDE.md §4). */
export interface AccessTokenPayload {
  sub: string;
  schoolId: string;
  role: UserRole;
}
