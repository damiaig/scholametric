import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { Prisma, StudentStatus, type Term, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { forSchool } from "../common/tenant/for-school";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { getAssignedSubjectMap } from "./subject-assignment.util";

// Extracted from GradesService (v0.7 step 1) so ExamsService can share the
// EXACT same roster/term-lock/tenant-scope/teacher-assignment rules rather
// than a second copy that could drift — same reasoning teacher-access.util.ts's
// own header documents.

export async function getRoster(prisma: PrismaService, schoolId: string, classArmId: string, sessionId: string) {
  const enrollments = await prisma.studentEnrollment.findMany({
    where: forSchool(schoolId, {
      classArmId,
      sessionId,
      student: { deletedAt: null, status: { not: StudentStatus.WITHDRAWN } },
    }),
    include: { student: true },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }, { studentId: "asc" }],
  });
  return enrollments.map((e) => e.student);
}

// Shared by both tracks' grid-read and grid-write paths (v0.5's term
// lifecycle, SPEC_V0.5.md §2.3) — a closed term blocks EvaluationScore/
// ExamScore edits exactly like it already blocks the old StudentScore
// edits; principal unlock (term_unlocks) is the ONLY way to edit a slice
// of a closed term, unchanged. Both tracks call this same function so
// they can never drift on what "locked" means.
export async function resolveSliceLockState(
  tx: Prisma.TransactionClient | PrismaService,
  params: { termId: string; classArmId: string; subjectId: string; closedAt: Date | null },
): Promise<{ locked: boolean; unlockReason: string | null }> {
  if (params.closedAt === null) {
    return { locked: false, unlockReason: null };
  }
  const activeUnlock = await tx.termUnlock.findFirst({
    where: { termId: params.termId, classArmId: params.classArmId, subjectId: params.subjectId, relockedAt: null },
  });
  return { locked: !activeUnlock, unlockReason: activeUnlock?.reason ?? null };
}

// Shared tenant-scope resolution (classArm + subject + term existence,
// all 404 on miss) — no evaluation/exam-specific check, so both tracks'
// recompute/publish/unpublish (which don't scope to one evaluation/exam)
// use this exact same function.
export async function resolveTenantScopeSubjectOnly(
  prisma: PrismaService,
  schoolId: string,
  ids: { classArmId: string; subjectId: string; termId: string },
): Promise<{ term: Term }> {
  const [classArm, subject, term] = await Promise.all([
    prisma.classArm.findFirst({ where: forSchool(schoolId, { id: ids.classArmId }) }),
    prisma.subject.findFirst({ where: forSchool(schoolId, { id: ids.subjectId, deletedAt: null }) }),
    prisma.term.findFirst({ where: forSchool(schoolId, { id: ids.termId }) }),
  ]);
  if (!classArm) throw new NotFoundException("Class arm not found.");
  if (!subject) throw new NotFoundException("Subject not found.");
  if (!term) throw new NotFoundException("Term not found.");
  return { term };
}

// Shared by both tracks' whole-class-arm read paths (no subject/evaluation
// scoping needed).
export async function resolveTenantScopeArmTermOnly(
  prisma: PrismaService,
  schoolId: string,
  classArmId: string,
  termId: string,
): Promise<{ term: Term }> {
  const [classArm, term] = await Promise.all([
    prisma.classArm.findFirst({ where: forSchool(schoolId, { id: classArmId }) }),
    prisma.term.findFirst({ where: forSchool(schoolId, { id: termId }) }),
  ]);
  if (!classArm) throw new NotFoundException("Class arm not found.");
  if (!term) throw new NotFoundException("Term not found.");
  return { term };
}

// Shared by both tracks' score-entry paths (SPEC_V0.5.1.md §2.1/§2.2,
// carried into v0.7): TEACHER must hold a subject_teacher_assignment for
// this exact (subject, class arm, session); SCHOOL_ADMIN/PROPRIETOR are
// checked for existence-only (a subject only exists for a class once SOME
// teacher is assigned to teach it there) — 404, not 403, matching the
// "hidden, not forbidden" framing used everywhere else this rule applies.
export async function assertTeacherAssignment(
  prisma: PrismaService,
  schoolId: string,
  user: AuthenticatedUser,
  subjectId: string,
  classArmId: string,
  sessionId: string,
): Promise<void> {
  const assignedSubjects = await getAssignedSubjectMap(prisma, { schoolId, classArmId, sessionId });
  const assignment = assignedSubjects.get(subjectId);

  if (user.role === UserRole.TEACHER) {
    if (!assignment || assignment.teacherUserId !== user.userId) {
      throw new ForbiddenException("You are not assigned to teach this subject for this class.");
    }
    return;
  }

  if (!assignment) {
    throw new NotFoundException("No teacher is assigned to teach this subject for this class.");
  }
}
