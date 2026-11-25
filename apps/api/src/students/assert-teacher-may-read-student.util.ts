import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { resolveTeacherAccess } from "../grades/teacher-access.util";

// v0.9 Item E1 (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — a TEACHER may
// read a student's bio/identity data (detail, guardians, the list) only
// if the student's CURRENT class arm is one they teach (class-teacher OR
// any subject assignment, via resolveTeacherAccess — the same relationship
// GET /class-arms/:id and grade reads already use). Deliberately a
// simpler, CURRENT-only rule than results/report-card/exams/year-exams
// use (those stay scoped to the query's REQUESTED session, letting a
// teacher pull up a past term they genuinely taught the student even
// after rotating off this year's class — see DECISIONS for why that
// asymmetry is intentional, not an oversight). A student with no current
// enrollment has nothing for this rule to check against, so a TEACHER is
// refused categorically — only admin/proprietor (who never call this)
// can see such a student.
export async function assertTeacherMayReadStudent(
  prisma: PrismaService,
  params: { schoolId: string; teacherUserId: string; currentClassArmId: string | null; currentSessionId: string | null },
): Promise<void> {
  if (!params.currentClassArmId || !params.currentSessionId) {
    throw new ForbiddenException("You are not assigned to this student's class.");
  }
  const access = await resolveTeacherAccess(prisma, {
    schoolId: params.schoolId,
    teacherUserId: params.teacherUserId,
    classArmId: params.currentClassArmId,
    sessionId: params.currentSessionId,
  });
  if (!access.isClassTeacher && access.subjectIds.length === 0) {
    throw new ForbiddenException("You are not assigned to this student's class.");
  }
}
