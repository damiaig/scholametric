import { z } from "zod";
import type { WeekdayValue } from "./calendar";

// v0.8.4 step 2 (SPEC_V0.8.4.md §4.2) — the student-facing contract,
// finalized here even though the frontend doesn't consume it until step
// 5 (a deliberate deviation from homework's own precedent — see
// docs/DECISIONS.md). Lesson has ZERO per-student state (no mark-done,
// no submissions), so unlike StudentHomeworkEntry there is no markedDone/
// markedAt/submissions field at all here.

export interface LessonAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface StudentLessonEntry {
  id: string;
  subjectId: string;
  subjectName: string;
  teacherName: string;
  title: string;
  body: string;
  lessonDate: string;
  // Always [] until step 3 — LessonAttachment doesn't exist as a table
  // yet. Forward-declared now so this shape doesn't change again then.
  attachments: LessonAttachment[];
}

export interface StudentLessonListResponse {
  classArmId: string;
  lessons: StudentLessonEntry[];
}

// Deliberately DUPLICATED from homework.ts's own TeachingWeekdaysResponse
// (byte-identical shape) rather than imported — a one-line wrapper type
// isn't worth coupling the lessons domain to homework's own shared-types
// file, the same cross-domain smell avoided everywhere else in this
// codebase. Could relocate to calendar.ts someday (it's really a calendar
// concept, not a homework one) — not done now, out of scope for this step.
// Named distinctly (not "TeachingWeekdaysResponse") only because the
// barrel (index.ts) re-exports both files with `export *` — an identical
// bare name would be a real ambiguous-export compile error there, not
// just a style choice.
export interface LessonTeachingWeekdaysResponse {
  weekdays: WeekdayValue[];
}

// v0.8.4 step 4 (SPEC_V0.8.4.md §6 step 4) — the TEACHER-facing contract,
// mirroring homework.ts's own teacher half. Independently declared, not
// imported from homework.ts — same cross-domain-duplication convention
// this file already established for LessonTeachingWeekdaysResponse.

export type LessonStatus = "DRAFT" | "PUBLISHED";

export interface Lesson {
  id: string;
  classArmId: string;
  subjectId: string;
  teacherUserId: string;
  teacherName: string;
  sessionId: string;
  title: string;
  body: string;
  lessonDate: string;
  status: LessonStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: LessonAttachment[];
}

export interface LessonListResponse {
  classArmId: string;
  subjectId: string;
  lessons: Lesson[];
}

// Shared by the create/edit form dialog — mirrors homeworkFormSchema's
// own caps exactly (title 200, body 5000, matching CreateLessonDto's
// own MaxLength values). No requiresUpload field — that concept doesn't
// exist for a read-only Lesson. lessonDate has no client-side school-day/
// teaching-day check here (that's StyledDatePicker's maxDate+disableDate
// job, backed by the server's own CalendarService checks) — this just
// guards against submitting a blank form.
export const lessonFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be at most 200 characters"),
  body: z.string().min(1, "Body is required").max(5000, "Body must be at most 5000 characters"),
  lessonDate: z.string().min(1, "Lesson date is required"),
});
export type LessonFormInput = z.infer<typeof lessonFormSchema>;

export interface CreateLessonInput extends LessonFormInput {
  classArmId: string;
  subjectId: string;
}

export type UpdateLessonInput = Partial<LessonFormInput>;

// Distinct name from homework.ts's own UploadUrlIssueResponse — the
// barrel (index.ts) re-exports both files with `export *`, and an
// identical bare name there is a real ambiguous-export compile error
// (TS2308), not just a style question, same class of issue the backend's
// own LessonAttachmentResponse/UploadUrlIssueResponse pair already hit.
export interface LessonUploadUrlIssueResponse {
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
  maxSizeBytes: number;
}

// Mirrored from apps/api/src/lessons/lesson.constants.ts — duplicated on
// purpose (no import path from this package into apps/api/src), same
// pattern already used for HOMEWORK_ATTACHMENT_CAP_BYTES between the DTO
// and this package's own Zod/display layer. Display/UX only: the
// server's own two-checkpoint check is the sole authority.
export const LESSON_ATTACHMENT_CAP_BYTES = 20 * 1024 * 1024;
