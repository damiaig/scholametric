import { z } from "zod";

// v0.6 step 2: one field, staff email OR STUDENT/PARENT portal username —
// no format validation beyond non-empty (see login.dto.ts on the API side
// for why: the two identifier shapes are structurally disjoint, so an
// unrecognized shape just won't resolve to any account).
export const loginSchema = z.object({
  schoolSlug: z.string().min(1, "Please select your school"),
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// PROPRIETOR added in v0.2 (backend Prisma enum, step 1) — was missing here
// until v0.2 step 5 added the first frontend code that needs to compare
// against it (see docs/DECISIONS.md).
export type UserRole = "SUPER_ADMIN" | "PROPRIETOR" | "SCHOOL_ADMIN" | "TEACHER" | "PARENT" | "STUDENT";
export type SchoolType = "NURSERY_PRIMARY" | "SECONDARY" | "COMBINED";
export type SchoolStatus = "ACTIVE" | "SUSPENDED";

export interface AuthUserSummary {
  id: string;
  // v0.6: null for STUDENT/PARENT portal accounts (they log in by
  // username, packages/shared's loginSchema `identifier` field above).
  email: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  schoolId: string;
  school: { id: string; name: string; slug: string };
  mustChangePassword: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUserSummary;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface CurrentUserSchool {
  id: string;
  name: string;
  slug: string;
  type: SchoolType;
  status: SchoolStatus;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface CurrentUser {
  id: string;
  // v0.6: null for STUDENT/PARENT portal accounts — see AuthUserSummary.
  email: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: string;
  lastLoginAt: string | null;
  school: CurrentUserSchool;
  mustChangePassword: boolean;
}

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
