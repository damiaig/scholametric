import { z } from "zod";
import type { Paginated } from "./pagination";
import type { StudentStatus } from "./students";
import type { Subject } from "./personnel";

export interface SubjectWithLevels extends Subject {
  classLevels: { id: string; name: string; rank: number }[];
}

export interface ClassArmSubjectTeacher {
  id: string;
  subjectId: string;
  subjectName: string;
  teacherUserId: string;
  teacherFirstName: string;
  teacherLastName: string;
}

export interface ClassArmStudentRow {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  status: StudentStatus;
}

export interface ClassArmDetail {
  id: string;
  name: string;
  classLevel: { id: string; name: string; rank: number };
  classTeacher: { userId: string; firstName: string; lastName: string } | null;
  subjectTeachers: ClassArmSubjectTeacher[];
  students: Paginated<ClassArmStudentRow>;
}

// Used only for POST /class-levels/:id/arms — classLevelId comes from the
// path, unlike createClassArmSchema (academic.ts) which is for the flat
// POST /class-arms.
export const addClassArmSchema = z.object({
  name: z.string().min(1, "Name is required"),
});
export type AddClassArmInput = z.infer<typeof addClassArmSchema>;

export const createSubjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().optional().or(z.literal("")),
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  code: z.string().optional().or(z.literal("")),
});
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
