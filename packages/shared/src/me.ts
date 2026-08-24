import type { TermNameValue } from "./academic";
import type { Gender, StudentStatus } from "./students";

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

// v0.6 step 3 (SPEC_V0.6.md §2.3) — GET /me/profile: a STUDENT's own basic
// profile. Deliberately NOT the admin StudentDetail shape (guardians, full
// history) — least-privilege, self-view fields only.
export interface MyProfile {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  gender: Gender;
  dateOfBirth: string;
  status: StudentStatus;
  currentClassArmLabel: string | null;
}

// GET /me/terms — the sessions/terms THIS student was ever enrolled in
// (their own student_enrollments only), so a term picker has something to
// read without broadening GET /sessions or /terms's admin-only RBAC.
export interface MyTermSummary {
  id: string;
  name: TermNameValue;
  isCurrent: boolean;
  closedAt: string | null;
}

export interface MySessionSummary {
  id: string;
  name: string;
  isCurrent: boolean;
  terms: MyTermSummary[];
}

export interface MyAcademicContext {
  sessions: MySessionSummary[];
}

// v0.6 step 4 (SPEC_V0.6.md §2.4) — GET /me/children: the child-switcher's
// data, one MyProfile per linked child (same shape as GET /me/profile —
// not a second "child summary" type invented for the switcher).
export interface MyChildrenResponse {
  children: MyProfile[];
}
