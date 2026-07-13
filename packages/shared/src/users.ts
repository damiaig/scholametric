import { z } from "zod";

// Only these two are creatable/assignable via the Users UI — SUPER_ADMIN is
// provisioned only via school creation; PARENT/STUDENT accounts don't exist
// yet (v0.1 scope).
export const STAFF_ROLES = ["SCHOOL_ADMIN", "TEACHER"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type UserAccountStatus = "ACTIVE" | "DISABLED";

export interface StaffUser {
  id: string;
  schoolId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  status: UserAccountStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const createUserSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(STAFF_ROLES, { message: "Select a role" }),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  role: z.enum(STAFF_ROLES).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export interface CreateUserResponse {
  user: StaffUser;
  temporaryPassword: string;
}

export interface ResetPasswordResponse {
  temporaryPassword: string;
}
