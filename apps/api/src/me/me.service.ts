import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";

export interface MyClassTeacherOfEntry {
  classArmId: string;
  className: string;
  sessionId: string;
  sessionName: string;
  enrollmentCount: number;
}

export interface MySubjectTaughtEntry {
  id: string;
  subjectId: string;
  subjectName: string;
  classArmId: string;
  className: string;
}

export interface TeachingLoad {
  classTeacherOf: MyClassTeacherOfEntry[];
  subjects: MySubjectTaughtEntry[];
}

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  // Reuses the same class-teacher/subject-teacher join shape as
  // TeachersService.findOne (SPEC_V0.3.md §2, resolution 4) plus a current-
  // session enrollment count per class arm — a separate endpoint (not a
  // param-less alias of GET /teachers/:userId) so that endpoint's response
  // shape for admins is untouched. Works for any staff with assignments,
  // not just TEACHER (no role filter, unlike GET /teachers/:userId) — a
  // PROPRIETOR/SCHOOL_ADMIN who also holds a class-teacher assignment still
  // gets their own load back. No StaffProfile lookup needed at all: the
  // response never includes personnel-summary fields.
  async findMyTeaching(userId: string): Promise<TeachingLoad> {
    const schoolId = this.tenantContext.schoolId;

    const [classTeacherAssignments, subjectTeacherAssignments] = await Promise.all([
      this.prisma.classTeacherAssignment.findMany({
        where: forSchool(schoolId, { teacherUserId: userId, session: { isCurrent: true } }),
        include: { classArm: { include: { classLevel: true } }, session: true },
      }),
      this.prisma.subjectTeacherAssignment.findMany({
        where: forSchool(schoolId, { teacherUserId: userId, session: { isCurrent: true } }),
        include: { subject: true, classArm: { include: { classLevel: true } } },
      }),
    ]);

    const enrollmentCounts = classTeacherAssignments.length
      ? await this.prisma.studentEnrollment.groupBy({
          by: ["classArmId"],
          where: forSchool(schoolId, {
            classArmId: { in: classTeacherAssignments.map((a) => a.classArmId) },
            sessionId: classTeacherAssignments[0].sessionId,
          }),
          _count: { _all: true },
        })
      : [];
    const enrollmentCountByArm = new Map(enrollmentCounts.map((row) => [row.classArmId, row._count._all]));

    return {
      classTeacherOf: classTeacherAssignments.map((assignment) => ({
        classArmId: assignment.classArmId,
        className: `${assignment.classArm.classLevel.name} ${assignment.classArm.name}`,
        sessionId: assignment.sessionId,
        sessionName: assignment.session.name,
        enrollmentCount: enrollmentCountByArm.get(assignment.classArmId) ?? 0,
      })),
      subjects: subjectTeacherAssignments.map((assignment) => ({
        id: assignment.id,
        subjectId: assignment.subjectId,
        subjectName: assignment.subject.name,
        classArmId: assignment.classArmId,
        className: `${assignment.classArm.classLevel.name} ${assignment.classArm.name}`,
      })),
    };
  }
}
