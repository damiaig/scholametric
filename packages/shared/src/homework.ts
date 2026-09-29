import { z } from "zod";

// v0.8.2 step 5 (SPEC_V0.8.2.md §6 item 5) — the frontend's first contact
// with the homework domain (Steps 1-4 were backend-only). Mirrors the
// backend's own response shapes (HomeworkService) exactly; no import path
// exists from apps/api into this package, so these are independently
// declared, same as every other shared-types file in this repo.

export type HomeworkStatus = "DRAFT" | "PUBLISHED";

export interface HomeworkAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Homework {
  id: string;
  classArmId: string;
  subjectId: string;
  teacherUserId: string;
  teacherName: string;
  sessionId: string;
  termId: string;
  title: string;
  description: string;
  dueDate: string;
  requiresUpload: boolean;
  status: HomeworkStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: HomeworkAttachment[];
}

export interface HomeworkListResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  homework: Homework[];
}

// Shared by the create/edit form dialog — dueDate has no client-side
// school-day check (that's the server's job, CalendarService); this just
// guards against submitting a blank form. Caps mirror CreateHomeworkDto's
// own MaxLength values exactly (title 200, description 5000).
export const homeworkFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be at most 200 characters"),
  description: z.string().min(1, "Description is required").max(5000, "Description must be at most 5000 characters"),
  dueDate: z.string().min(1, "Due date is required"),
  requiresUpload: z.boolean(),
});
export type HomeworkFormInput = z.infer<typeof homeworkFormSchema>;

export interface CreateHomeworkInput extends HomeworkFormInput {
  classArmId: string;
  subjectId: string;
  termId: string;
}

export type UpdateHomeworkInput = Partial<HomeworkFormInput>;

export interface HomeworkSubmission {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface HomeworkSubmissionsView {
  homeworkId: string;
  students: Array<{
    studentId: string;
    studentName: string;
    markedDone: boolean;
    markedAt: string | null;
    submissions: HomeworkSubmission[];
  }>;
}

export interface UploadUrlIssueResponse {
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
  maxSizeBytes: number;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
  expiresAt: string;
}

// Mirrored from apps/api/src/homework/homework.constants.ts — duplicated
// on purpose (no import path from this package into apps/api/src), same
// pattern already used for description-length caps between DTOs and Zod
// schemas elsewhere in this file. Display/UX only: the server's own
// two-checkpoint check (budget at upload-url-issue, verified actual size
// at commit) is the sole authority — a stale client-side number just means
// a 409 surfaces if it's wrong by the time of submit.
export const HOMEWORK_ATTACHMENT_CAP_BYTES = 20 * 1024 * 1024;
export const HOMEWORK_SUBMISSION_CAP_BYTES = 20 * 1024 * 1024;
