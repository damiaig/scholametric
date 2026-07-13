import { z } from "zod";

export type Gender = "MALE" | "FEMALE";
export type StudentStatus = "ACTIVE" | "SUSPENDED" | "GRADUATED" | "TRANSFERRED" | "WITHDRAWN";

export interface ClassLevel {
  id: string;
  schoolId: string;
  name: string;
  rank: number;
}

export interface ClassArm {
  id: string;
  schoolId: string;
  classLevelId: string;
  name: string;
}

export interface CurrentEnrollment {
  id: string;
  classArmId: string;
  sessionId: string;
  enrolledOn: string;
  classArm: { id: string; name: string; classLevel: { id: string; name: string; rank: number } };
  session: { id: string; name: string; isCurrent: boolean };
}

export interface Student {
  id: string;
  schoolId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  gender: Gender;
  dateOfBirth: string;
  admittedOn: string;
  status: StudentStatus;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
  currentEnrollment: CurrentEnrollment | null;
}

function isPastDate(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now();
}

// Split into sub-schemas and merged, rather than one flat schema, so the
// bio/guardian field sets can be reused unchanged between the create form
// (bio + guardian + class) and the edit dialog (bio + guardian only — class
// changes go through the separate transfer-class action).
export const bioSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  middleName: z.string().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE"], { errorMap: () => ({ message: "Select a gender" }) }),
  dateOfBirth: z
    .string()
    .min(1, "Date of birth is required")
    .refine(isPastDate, { message: "Date of birth must be in the past" }),
});

export const guardianSchema = z.object({
  guardianName: z.string().min(1, "Guardian name is required"),
  guardianPhone: z.string().min(1, "Guardian phone is required"),
  guardianEmail: z.string().email("Enter a valid email address").optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
});

export const classSchema = z.object({
  classArmId: z.string().min(1, "Class is required"),
  admissionNumber: z.string().optional().or(z.literal("")),
});

export const createStudentSchema = bioSchema.merge(guardianSchema).merge(classSchema);
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = bioSchema.merge(guardianSchema).partial();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const withdrawStudentSchema = z.object({
  reason: z.string().min(1, "A reason is required"),
});
export type WithdrawStudentInput = z.infer<typeof withdrawStudentSchema>;

export const transferClassSchema = z.object({
  classArmId: z.string().min(1, "Class is required"),
});
export type TransferClassInput = z.infer<typeof transferClassSchema>;
