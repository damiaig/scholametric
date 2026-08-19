import { PrismaService } from "../prisma/prisma.service";
import { forSchool } from "../common/tenant/for-school";

export interface AssignedSubjectEntry {
  assignmentId: string;
  subjectId: string;
  subjectName: string;
  teacherUserId: string;
  teacherFirstName: string;
  teacherLastName: string;
}

// SPEC_V0.5.1.md §4: a subject is "for a class" iff a
// subject_teacher_assignment exists for that (class-arm, subject, session).
// One helper, keyed by subjectId, so grade entry (assertTeacherAssignment),
// overview/review/report-card (needsTeacherAssignment flagging), and the
// Classes tab's detail view all read the exact same set — they cannot drift
// against each other.
export async function getAssignedSubjectMap(
  prisma: PrismaService,
  params: { schoolId: string; classArmId: string; sessionId: string },
): Promise<Map<string, AssignedSubjectEntry>> {
  const assignments = await prisma.subjectTeacherAssignment.findMany({
    where: forSchool(params.schoolId, { classArmId: params.classArmId, sessionId: params.sessionId }),
    include: { subject: { select: { name: true } }, teacherUser: { select: { firstName: true, lastName: true } } },
    orderBy: { subject: { name: "asc" } },
  });
  return new Map(
    assignments.map((assignment) => [
      assignment.subjectId,
      {
        assignmentId: assignment.id,
        subjectId: assignment.subjectId,
        subjectName: assignment.subject.name,
        teacherUserId: assignment.teacherUserId,
        teacherFirstName: assignment.teacherUser.firstName,
        teacherLastName: assignment.teacherUser.lastName,
      },
    ]),
  );
}
