import { z } from "zod";
import type { UserAccountStatus } from "./users";

// Matches the backend Prisma JobTitle enum (apps/api/prisma/schema.prisma).
export const JOB_TITLES = [
  "DIRECTOR_PROPRIETOR",
  "PRINCIPAL",
  "VICE_PRINCIPAL",
  "REGISTRAR",
  "EXAMINATION_OFFICER",
  "BURSAR",
  "SECRETARY",
  "ICT_ADMINISTRATOR",
  "SCHOOL_NURSE",
  "GUIDANCE_COUNSELOR",
  "TEACHER",
  "OTHER",
] as const;
export type JobTitleValue = (typeof JOB_TITLES)[number];

export const JOB_TITLE_LABELS: Record<JobTitleValue, string> = {
  DIRECTOR_PROPRIETOR: "Director/Proprietor",
  PRINCIPAL: "Principal",
  VICE_PRINCIPAL: "Vice Principal",
  REGISTRAR: "Registrar",
  EXAMINATION_OFFICER: "Examination Officer",
  BURSAR: "Bursar",
  SECRETARY: "Secretary",
  ICT_ADMINISTRATOR: "ICT Administrator",
  SCHOOL_NURSE: "School Nurse",
  GUIDANCE_COUNSELOR: "Guidance Counselor",
  TEACHER: "Teacher",
  OTHER: "Other",
};

// SUPER_ADMIN is provisioned only via school creation; PARENT/STUDENT
// accounts don't exist yet — matches the backend's PERSONNEL_CREATABLE_ROLES.
export const PERSONNEL_ROLES = ["PROPRIETOR", "SCHOOL_ADMIN", "TEACHER"] as const;
export type PersonnelRole = (typeof PERSONNEL_ROLES)[number];

export const PERSONNEL_ROLE_LABELS: Record<PersonnelRole, string> = {
  PROPRIETOR: "Proprietor",
  SCHOOL_ADMIN: "School admin",
  TEACHER: "Teacher",
};

export interface PersonnelSummary {
  id: string;
  schoolId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: PersonnelRole;
  status: UserAccountStatus;
  lastLoginAt: string | null;
  staffProfileId: string;
  staffNumber: string;
  jobTitle: JobTitleValue;
  phone: string | null;
  qualification: string | null;
  dateEmployed: string | null;
}

export interface ClassTeacherOfEntry {
  classArmId: string;
  className: string;
  sessionId: string;
  sessionName: string;
}

export interface SubjectTaughtEntry {
  id: string;
  subjectId: string;
  subjectName: string;
  classArmId: string;
  className: string;
}

export interface TeacherDetail extends PersonnelSummary {
  classTeacherOf: ClassTeacherOfEntry[];
  subjectsTaught: SubjectTaughtEntry[];
}

export const createPersonnelSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(PERSONNEL_ROLES, { message: "Select a role" }),
  jobTitle: z.enum(JOB_TITLES, { message: "Select a title" }),
  phone: z.string().optional().or(z.literal("")),
  qualification: z.string().optional().or(z.literal("")),
  dateEmployed: z.string().optional().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type CreatePersonnelInput = z.infer<typeof createPersonnelSchema>;

export const updatePersonnelSchema = z.object({
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  role: z.enum(PERSONNEL_ROLES).optional(),
  jobTitle: z.enum(JOB_TITLES).optional(),
  phone: z.string().optional().or(z.literal("")),
  qualification: z.string().optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});
export type UpdatePersonnelInput = z.infer<typeof updatePersonnelSchema>;

export interface Subject {
  id: string;
  schoolId: string;
  name: string;
  code: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectTeacherAssignment {
  id: string;
  schoolId: string;
  subjectId: string;
  classArmId: string;
  teacherUserId: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
}

// GET /classes response shape (arms flattened out of each level for the
// assignment dialogs' arm pickers on the Teachers pages).
export interface ClassArmOverview {
  id: string;
  name: string;
  enrollmentCount: number;
  classTeacher: { userId: string; firstName: string; lastName: string } | null;
}

export interface ClassLevelOverview {
  id: string;
  name: string;
  rank: number;
  arms: ClassArmOverview[];
}
