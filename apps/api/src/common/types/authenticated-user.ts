import type { UserRole } from "@prisma/client";

/** Shape of `request.user`, populated by JwtAuthGuard from a verified access token. */
export interface AuthenticatedUser {
  userId: string;
  schoolId: string;
  role: UserRole;
  mustChangePassword: boolean;
}
