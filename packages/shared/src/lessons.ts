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
