import { PrismaService } from "../prisma/prisma.service";
import { forSchool } from "../common/tenant/for-school";

export interface TeacherAccess {
  isClassTeacher: boolean;
  subjectIds: string[];
}

// The one unifying "what can this teacher see in this class arm" rule —
// class-teacher sees everything, subject-teacher sees their lane, no
// relationship sees nothing. Originally private to GradesService
// (getClassArmResults/getStudentResults/getReportCard); extracted here in
// SPEC_V0.5.1.md §2.4/v0.5.1 step 2 so ClassesService/ClassArmsService can
// use the EXACT same definition of "a teacher's classes" for visibility
// scoping — one rule, not two that could drift.
export async function resolveTeacherAccess(
  prisma: PrismaService,
  params: { schoolId: string; teacherUserId: string; classArmId: string; sessionId: string },
): Promise<TeacherAccess> {
  const [classTeacher, subjectAssignments] = await Promise.all([
    prisma.classTeacherAssignment.findFirst({
      where: forSchool(params.schoolId, { classArmId: params.classArmId, sessionId: params.sessionId, teacherUserId: params.teacherUserId }),
    }),
    prisma.subjectTeacherAssignment.findMany({
      where: forSchool(params.schoolId, { classArmId: params.classArmId, sessionId: params.sessionId, teacherUserId: params.teacherUserId }),
      select: { subjectId: true },
    }),
  ]);
  return { isClassTeacher: Boolean(classTeacher), subjectIds: subjectAssignments.map((a) => a.subjectId) };
}

// The "list every class arm this teacher touches" counterpart, for the
// Classes list — same two tables, same relationship definition as
// resolveTeacherAccess above, just not narrowed to one arm.
export async function resolveTeacherArmIds(
  prisma: PrismaService,
  params: { schoolId: string; teacherUserId: string; sessionId: string },
): Promise<Set<string>> {
  const [classTeacherOf, subjectTeacherIn] = await Promise.all([
    prisma.classTeacherAssignment.findMany({
      where: forSchool(params.schoolId, { sessionId: params.sessionId, teacherUserId: params.teacherUserId }),
      select: { classArmId: true },
    }),
    prisma.subjectTeacherAssignment.findMany({
      where: forSchool(params.schoolId, { sessionId: params.sessionId, teacherUserId: params.teacherUserId }),
      select: { classArmId: true },
    }),
  ]);
  return new Set([...classTeacherOf.map((c) => c.classArmId), ...subjectTeacherIn.map((s) => s.classArmId)]);
}
