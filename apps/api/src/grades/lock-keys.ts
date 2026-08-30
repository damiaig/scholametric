// Advisory-lock key builders shared between GradesService and TermsService
// (SPEC_V0.5.md §2.3, v0.5 step 3) — extracted so the two services can never
// compute even slightly different strings for the same lock, which would
// silently break the serialization guarantee between them. Fixed acquisition
// order across this codebase: term -> subject -> class-arm, never reversed.
// saveGrid acquires all three (the third conditionally); close/unlock/relock
// acquire ONLY the term lock; publish/unpublish/recompute/override never
// touch the term lock at all. See grades.service.ts and terms.service.ts.
//
// v0.7 step 1 (SPEC_V0.7.md §5): termLockKey stays SHARED across both the
// evaluation and exam tracks — a closed term blocks editing either track,
// so close/unlock/relock's existing single lock still serializes against
// both. The exam-track subject/class-arm/year keys below are a DISTINCT
// string namespace (different prefix) from the evaluation-track ones —
// deliberately, so evaluation and exam writes for the SAME subject/term
// never contend with each other (they touch entirely different tables,
// so there's no lost-update risk between them, only within each track).
// Extended ordering, never reversed: term -> subject -> class-arm -> year.

export function termLockKey(schoolId: string, termId: string): string {
  return `grades:term:${schoolId}:${termId}`;
}

export function subjectLockKey(schoolId: string, subjectId: string, classArmId: string, termId: string): string {
  return `grades:${schoolId}:${subjectId}:${classArmId}:${termId}`;
}

export function classArmLockKey(schoolId: string, classArmId: string, termId: string): string {
  return `grades:${schoolId}:${classArmId}:${termId}`;
}

export function examSubjectLockKey(schoolId: string, subjectId: string, classArmId: string, termId: string): string {
  return `exams:${schoolId}:${subjectId}:${classArmId}:${termId}`;
}

export function examClassArmLockKey(schoolId: string, classArmId: string, termId: string): string {
  return `exams:${schoolId}:${classArmId}:${termId}`;
}

// Coarser scope (whole session, not one class arm/term) — guards the
// whole-year exam aggregate cascade, which spans all three terms.
export function examYearLockKey(schoolId: string, sessionId: string): string {
  return `exams:year:${schoolId}:${sessionId}`;
}
