import { Injectable, NotFoundException } from "@nestjs/common";
import { Gender, StudentStatus, TermName, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { GradesService, type ReportCardResponse } from "../grades/grades.service";
import type { GetStudentResultsQueryDto } from "../grades/dto/get-student-results-query.dto";

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
  // v0.4 step 4: the score-entry grid's term picker needs to know "the
  // current term" to default to, and TEACHER has no other accessible way
  // to discover it — GET /sessions and GET /terms are both admin-only.
  // Null if the school has no current session/term configured yet (same
  // "empty session" state the admin dashboard already handles).
  // currentTermName rides along for free (already fetched) so the UI
  // doesn't have to display a raw id.
  currentSessionId: string | null;
  currentTermId: string | null;
  currentTermName: TermName | null;
}

// v0.6 step 3 (SPEC_V0.6.md §2.3): a STUDENT's own basic profile —
// deliberately NOT StudentsService.findOne()'s richer admin "detail" shape
// (guardians, full history), which is more than a self-view needs. Same
// current-enrollment resolution as StudentsService's own
// currentEnrollmentInclude, kept as a separate small query here rather
// than importing that private const across modules for four lines.
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

export interface MyTermSummary {
  id: string;
  name: TermName;
  isCurrent: boolean;
  closedAt: string | null;
}

export interface MySessionSummary {
  id: string;
  name: string;
  isCurrent: boolean;
  terms: MyTermSummary[];
}

// v0.6 step 3: which sessions/terms THIS student was ever enrolled in —
// scoped entirely by their own student_enrollments rows, never another
// student's. Exists because GET /sessions and GET /terms are admin-only
// (same reason findMyTeaching() above exposes currentSessionId/
// currentTermId for TEACHER instead of broadening those endpoints' RBAC).
export interface MyAcademicContext {
  sessions: MySessionSummary[];
}

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly gradesService: GradesService,
  ) {}

  // The identity-resolution seam every /me/* STUDENT endpoint below goes
  // through: userId is ALWAYS @CurrentUser().userId (the verified JWT
  // subject), never a request field — there is no studentId param
  // anywhere on these routes for a caller to override "self" with. Throws
  // (rather than returning null) on the pathological case of a STUDENT-
  // role account with no linked student — can't happen given the v0.6
  // step 1 CHECK constraint, but a fresh lookup only costs one indexed
  // query and this keeps every caller below from having to re-guard it.
  private async resolveOwnStudentId(userId: string): Promise<string> {
    const schoolId = this.tenantContext.schoolId;
    const user = await this.prisma.user.findFirst({
      where: forSchool(schoolId, { id: userId, role: UserRole.STUDENT, deletedAt: null }),
      select: { studentId: true },
    });
    if (!user?.studentId) {
      throw new NotFoundException("Student profile not found.");
    }
    return user.studentId;
  }

  async getMyProfile(userId: string): Promise<MyProfile> {
    const schoolId = this.tenantContext.schoolId;
    const studentId = await this.resolveOwnStudentId(userId);

    const student = await this.prisma.student.findFirstOrThrow({
      where: forSchool(schoolId, { id: studentId, deletedAt: null }),
      include: {
        enrollments: {
          where: { session: { isCurrent: true } },
          include: { classArm: { include: { classLevel: true } } },
          take: 1,
        },
      },
    });
    const currentEnrollment = student.enrollments[0] ?? null;

    return {
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth.toISOString(),
      status: student.status,
      currentClassArmLabel: currentEnrollment
        ? `${currentEnrollment.classArm.classLevel.name} ${currentEnrollment.classArm.name}`
        : null,
    };
  }

  async getMyAcademicContext(userId: string): Promise<MyAcademicContext> {
    const schoolId = this.tenantContext.schoolId;
    const studentId = await this.resolveOwnStudentId(userId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: forSchool(schoolId, { studentId }),
      select: { sessionId: true },
    });
    const sessionIds = [...new Set(enrollments.map((e) => e.sessionId))];
    if (sessionIds.length === 0) {
      return { sessions: [] };
    }

    const sessions = await this.prisma.academicSession.findMany({
      where: forSchool(schoolId, { id: { in: sessionIds } }),
      include: { terms: { orderBy: { startsOn: "asc" } } },
      orderBy: { startsOn: "desc" },
    });

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        name: session.name,
        isCurrent: session.isCurrent,
        terms: session.terms.map((term) => ({
          id: term.id,
          name: term.name,
          isCurrent: term.isCurrent,
          closedAt: term.closedAt?.toISOString() ?? null,
        })),
      })),
    };
  }

  // Delegates to the SAME GradesService.getReportCard() staff/TEACHER
  // callers use (v0.5 step 4) — not a fork. Passing role STUDENT through
  // the existing `user` object is what makes that method apply the
  // published-only filter (see its own doc comment); studentId is
  // resolved here, from the token, never taken from `query`.
  async getMyReportCard(user: AuthenticatedUser, query: GetStudentResultsQueryDto): Promise<ReportCardResponse> {
    const studentId = await this.resolveOwnStudentId(user.userId);
    return this.gradesService.getReportCard(studentId, query, user);
  }

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

    const [classTeacherAssignments, subjectTeacherAssignments, currentSession, currentTerm] = await Promise.all([
      this.prisma.classTeacherAssignment.findMany({
        where: forSchool(schoolId, { teacherUserId: userId, session: { isCurrent: true } }),
        include: { classArm: { include: { classLevel: true } }, session: true },
      }),
      this.prisma.subjectTeacherAssignment.findMany({
        where: forSchool(schoolId, { teacherUserId: userId, session: { isCurrent: true } }),
        include: { subject: true, classArm: { include: { classLevel: true } } },
      }),
      this.prisma.academicSession.findFirst({ where: forSchool(schoolId, { isCurrent: true }) }),
      this.prisma.term.findFirst({ where: forSchool(schoolId, { isCurrent: true }) }),
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
      currentSessionId: currentSession?.id ?? null,
      currentTermId: currentTerm?.id ?? null,
      currentTermName: currentTerm?.name ?? null,
    };
  }
}
