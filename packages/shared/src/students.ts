import { z } from "zod";
import { relationshipFieldSchema, validateGuardianEntry, type StudentGuardianSummary } from "./guardians";

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

export interface PrimaryGuardianSummary {
  guardianId: string;
  firstName: string;
  lastName: string;
  phone: string;
}

// guardianName/guardianPhone/guardianEmail/address are the v0.1 frozen
// legacy columns — the API still returns them (derived from the resolved
// primary guardian on create, see docs/DECISIONS.md) but nothing in the
// v0.2 UI reads them anymore; the Guardians section is the real source now.
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

// GET /students (list) rows — a cheap primaryGuardian summary, not the full roster.
export interface StudentListItem extends Student {
  primaryGuardian: PrimaryGuardianSummary | null;
}

// GET /students/:id — every linked guardian, primary first.
export interface StudentDetail extends Student {
  guardians: StudentGuardianSummary[];
}

function isPastDate(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now();
}

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

// v0.2 (SPEC_V0.2.md §2, a breaking change from v0.1 — see docs/DECISIONS.md):
// guardians are now a 1..n array, each entry either linking an existing
// guardian (mode: "existing", the sibling case) or creating a new one
// (mode: "new"). isPrimary is accepted per entry here — unlike the
// standalone add-guardian endpoint, creation time has no existing primary
// to steal from. `mode` is a client-only discriminant, stripped before
// the request is sent (see use-create-student.ts).
export const createStudentGuardianEntrySchema = z
  .object({
    mode: z.enum(["existing", "new"]),
    guardianId: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    relationship: relationshipFieldSchema,
    isPrimary: z.boolean().optional(),
  })
  .superRefine(validateGuardianEntry);
export type CreateStudentGuardianEntryInput = z.infer<typeof createStudentGuardianEntrySchema>;

export const guardiansArraySchema = z.array(createStudentGuardianEntrySchema).min(1, "At least one guardian is required");

export const classSchema = z.object({
  classArmId: z.string().min(1, "Class is required"),
  admissionNumber: z.string().optional().or(z.literal("")),
});

export const createStudentSchema = bioSchema.merge(classSchema).extend({ guardians: guardiansArraySchema });
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

// Guardian fields moved out in v0.2: edit a guardian via PATCH /guardians/:id,
// or the set of guardians via the /students/:id/guardians endpoints.
export const updateStudentSchema = bioSchema.partial();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const withdrawStudentSchema = z.object({
  reason: z.string().min(1, "A reason is required"),
});
export type WithdrawStudentInput = z.infer<typeof withdrawStudentSchema>;

export const transferClassSchema = z.object({
  classArmId: z.string().min(1, "Class is required"),
});
export type TransferClassInput = z.infer<typeof transferClassSchema>;
