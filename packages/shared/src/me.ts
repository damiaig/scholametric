import type { TermNameValue } from "./academic";

// GET /me/teaching response shape (v0.3, SPEC_V0.3.md §2) — the caller's
// own current-session teaching load. Not the same shape as
// ClassTeacherOfEntry/SubjectTaughtEntry (personnel.ts): this one adds
// enrollmentCount and drops the fields only an admin viewing someone
// else's record needs.
export interface MyClassTeacherEntry {
  classArmId: string;
  className: string;
  sessionId: string;
  sessionName: string;
  enrollmentCount: number;
}

export interface MySubjectEntry {
  id: string;
  subjectId: string;
  subjectName: string;
  classArmId: string;
  className: string;
}

export interface MyTeaching {
  classTeacherOf: MyClassTeacherEntry[];
  subjects: MySubjectEntry[];
  // v0.4 step 4: the score-entry grid's term picker default for TEACHER
  // (who has no other accessible way to discover the current term). Null
  // if the school has no current session/term configured yet.
  currentSessionId: string | null;
  currentTermId: string | null;
  currentTermName: TermNameValue | null;
}
