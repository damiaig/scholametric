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
// than importing that private const across modules for four lines. Reused
// as-is for v0.6 step 4's PARENT child views (buildProfile below) — one
// shape, not a second "child summary" type invented for the switcher.
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

// v0.6 step 4 (SPEC_V0.6.md §2.4): the child-switcher's data — every
// MyProfile the caller's own linked children resolve to.
export interface MyChildrenResponse {
  children: MyProfile[];
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

  // v0.6 step 4: the PARENT analogue of resolveOwnStudentId above —
  // userId is always the JWT subject, never a request field.
  private async resolveOwnGuardianId(userId: string): Promise<string> {
    const schoolId = this.tenantContext.schoolId;
    const user = await this.prisma.user.findFirst({
      where: forSchool(schoolId, { id: userId, role: UserRole.PARENT, deletedAt: null }),
      select: { guardianId: true },
    });
    if (!user?.guardianId) {
      throw new NotFoundException("Parent profile not found.");
    }
    return user.guardianId;
  }

  // The read-scope decision Step 1 already made: a PARENT's children are
  // the students with a DIRECT student_guardians row to their anchor
  // guardian — the exact inverse of Step 1's child_not_covered check
  // (emitted for a family member with NO such row). Not "the whole
  // connected-component family" — a child grouped into the family but not
  // directly linked to this guardian is simply never in this list, never
  // fetched, never filtered out after the fact.
  private async resolveOwnChildIds(userId: string): Promise<string[]> {
    const guardianId = await this.resolveOwnGuardianId(userId);
    const schoolId = this.tenantContext.schoolId;
    const links = await this.prisma.studentGuardian.findMany({
      where: forSchool(schoolId, { guardianId, student: { deletedAt: null } }),
      select: { studentId: true },
    });
    return links.map((link) => link.studentId);
  }

  // The one genuinely new attack surface v0.6 step 4 introduces (step 3
  // had no id at all): childId is a real request field this time, because
  // a parent has more than one child. Ordered FIRST in every companion
  // handler below, before any grade/profile query runs. A childId that
  // doesn't exist and a childId that belongs to a different family both
  // 404 identically here — the allow-list check is what rejects it, not
  // an existence check, so neither leaks which case it was.
  private async assertChildBelongsToCaller(userId: string, childId: string): Promise<void> {
    const childIds = await this.resolveOwnChildIds(userId);
    if (!childIds.includes(childId)) {
      throw new NotFoundException("Student not found.");
    }
  }

  private async buildProfile(studentId: string): Promise<MyProfile> {
    const schoolId = this.tenantContext.schoolId;
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

  private async buildAcademicContext(studentId: string): Promise<MyAcademicContext> {
    const schoolId = this.tenantContext.schoolId;
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

  async getMyProfile(userId: string): Promise<MyProfile> {
    const studentId = await this.resolveOwnStudentId(userId);
    return this.buildProfile(studentId);
  }

  async getMyAcademicContext(userId: string): Promise<MyAcademicContext> {
    const studentId = await this.resolveOwnStudentId(userId);
    return this.buildAcademicContext(studentId);
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

  // v0.6 step 4 — the child-switcher's data: every MyProfile the caller's
  // own linked children resolve to (§ resolveOwnChildIds above). A
  // guardian linked to zero students (shouldn't happen post-v0.6-step-1,
  // but not assumed away) returns { children: [] }, not an error.
  async getMyChildren(userId: string): Promise<MyChildrenResponse> {
    const childIds = await this.resolveOwnChildIds(userId);
    const children = await Promise.all(childIds.map((childId) => this.buildProfile(childId)));
    return { children };
  }

  async getChildProfile(userId: string, childId: string): Promise<MyProfile> {
    await this.assertChildBelongsToCaller(userId, childId);
    return this.buildProfile(childId);
  }

  async getChildTerms(userId: string, childId: string): Promise<MyAcademicContext> {
    await this.assertChildBelongsToCaller(userId, childId);
    return this.buildAcademicContext(childId);
  }

  // Same reuse as getMyReportCard above: assertChildBelongsToCaller runs
  // FIRST (before any grade query), then the caller's own `user` (role
  // PARENT) is passed straight through to the exact same
  // GradesService.getReportCard() — the published-only filter there
  // already covers PARENT alongside STUDENT (grades.service.ts, v0.6
  // step 4 widening of publishedOnlyForSelfView).
  async getChildReportCard(user: AuthenticatedUser, childId: string, query: GetStudentResultsQueryDto): Promise<ReportCardResponse> {
    await this.assertChildBelongsToCaller(user.userId, childId);
    return this.gradesService.getReportCard(childId, query, user);
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
