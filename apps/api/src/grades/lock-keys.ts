// Advisory-lock key builders shared between GradesService and TermsService
// (SPEC_V0.5.md §2.3, v0.5 step 3) — extracted so the two services can never
// compute even slightly different strings for the same lock, which would
// silently break the serialization guarantee between them. Fixed acquisition
// order across this codebase: term -> subject -> class-arm, never reversed.
// saveGrid acquires all three (the third conditionally); close/unlock/relock
// acquire ONLY the term lock; publish/unpublish/recompute/override never
// touch the term lock at all. See grades.service.ts and terms.service.ts.

export function termLockKey(schoolId: string, termId: string): string {
  return `grades:term:${schoolId}:${termId}`;
}

export function subjectLockKey(schoolId: string, subjectId: string, classArmId: string, termId: string): string {
  return `grades:${schoolId}:${subjectId}:${classArmId}:${termId}`;
}

export function classArmLockKey(schoolId: string, classArmId: string, termId: string): string {
  return `grades:${schoolId}:${classArmId}:${termId}`;
}
