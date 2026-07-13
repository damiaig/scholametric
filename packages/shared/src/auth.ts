import { z } from "zod";

export const loginSchema = z.object({
  schoolSlug: z.string().min(1, "Please select your school"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export type UserRole = "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "PARENT" | "STUDENT";
export type SchoolType = "NURSERY_PRIMARY" | "SECONDARY" | "COMBINED";
export type SchoolStatus = "ACTIVE" | "SUSPENDED";

export interface AuthUserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  schoolId: string;
  school: { id: string; name: string; slug: string };
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
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: string;
  lastLoginAt: string | null;
  school: CurrentUserSchool;
}
