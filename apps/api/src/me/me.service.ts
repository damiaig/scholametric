import { Injectable, NotFoundException } from "@nestjs/common";
import { Gender, StudentStatus, TermName, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { GradesService, type ReportCardResponse } from "../grades/grades.service";
import type { GetStudentResultsQueryDto } from "../grades/dto/get-student-results-query.dto";
import { ExamsService, type StudentSubjectExamsResponse, type YearExamsResponse } from "../exams/exams.service";
import type { GetStudentSubjectExamsQueryDto } from "../exams/dto/get-student-subject-exams-query.dto";
import type { GetYearExamsQueryDto } from "../exams/dto/get-year-exams-query.dto";
import { CalendarService, type ClassTimetableResponse, type TeacherTimetableResponse } from "../calendar/calendar.service";
import type { GetTimetableRangeDto } from "../calendar/dto/get-timetable-range.dto";
import {
  HomeworkService,
  type HomeworkCompletionResponse,
  type StudentHomeworkListResponse,
  type UploadUrlIssueResponse,
  type HomeworkSubmissionResponse,
} from "../homework/homework.service";
import type { MarkHomeworkDoneDto } from "../homework/dto/mark-homework-done.dto";
import type { RequestUploadUrlDto } from "../homework/dto/request-upload-url.dto";
import type { CommitFileDto } from "../homework/dto/commit-file.dto";
import type { DownloadUrlResult } from "../storage/storage.service";

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
    private readonly examsService: ExamsService,
    private readonly calendarService: CalendarService,
    private readonly homeworkService: HomeworkService,
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

  // v0.8 step 3 (SPEC_V0.8.md §7 item 3) — the same current-enrollment
  // resolution buildProfile above already does, trimmed to just the id
  // CalendarService.resolveClassSchedule needs. No current-session
  // enrollment -> 404 ("not currently enrolled"), not an empty 200: a
  // timetable has nothing meaningful to say without a class, unlike
  // buildProfile's own currentClassArmLabel, which tolerates null.
  private async resolveStudentCurrentClassArmId(studentId: string): Promise<string> {
    const schoolId = this.tenantContext.schoolId;
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: forSchool(schoolId, { studentId, session: { isCurrent: true } }),
      select: { classArmId: true },
    });
    if (!enrollment) {
      throw new NotFoundException("Not currently enrolled in a class.");
    }
    return enrollment.classArmId;
  }

  // v0.8.2 step 2 (SPEC_V0.8.2.md §6 item 2) — same inline "whichever Term
  // is currently marked isCurrent for this school" lookup findMyTeaching
  // below already does; no dedicated shared helper existed for it before
  // this. Needed because ClassArm is a PERMANENT entity (no sessionId/
  // termId of its own) — scoping a student's homework list by classArmId
  // alone would surface every homework ever assigned to that class across
  // every past term, forever.
  private async getCurrentTermId(schoolId: string): Promise<string> {
    const term = await this.prisma.term.findFirst({ where: forSchool(schoolId, { isCurrent: true }) });
    if (!term) {
      throw new NotFoundException("No current term is configured for this school yet.");
    }
    return term.id;
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

  // v0.7 step 3 (SPEC_V0.7.md §4) — same delegation shape as
  // getMyReportCard above, onto ExamsService.getStudentSubjectExams
  // instead: studentId resolved from the token, role STUDENT passed
  // through so the published-only wall there applies.
  async getMyExams(user: AuthenticatedUser, query: GetStudentSubjectExamsQueryDto): Promise<StudentSubjectExamsResponse> {
    const studentId = await this.resolveOwnStudentId(user.userId);
    return this.examsService.getStudentSubjectExams(studentId, query, user);
  }

  async getMyYearExams(user: AuthenticatedUser, query: GetYearExamsQueryDto): Promise<YearExamsResponse> {
    const studentId = await this.resolveOwnStudentId(user.userId);
    return this.examsService.getStudentYearExams(studentId, query, user);
  }

  // v0.8 step 3 (SPEC_V0.8.md §7 item 3) — the STUDENT's own class's
  // resolved weekly schedule. classArmId is resolved server-side from the
  // caller's own current enrollment (resolveStudentCurrentClassArmId,
  // just above resolveOwnStudentId's own kind of guard) — there is no
  // classArmId field on this route at all, so there is no id a caller
  // could substitute another class's with.
  async getMyTimetable(userId: string, query: GetTimetableRangeDto): Promise<ClassTimetableResponse> {
    const studentId = await this.resolveOwnStudentId(userId);
    const classArmId = await this.resolveStudentCurrentClassArmId(studentId);
    return this.calendarService.resolveClassSchedule(classArmId, query.from, query.to);
  }

  // v0.8.2 step 2 (SPEC_V0.8.2.md §6 item 2) — same "no classArmId field
  // on this route at all" shape as getMyTimetable above: classArmId AND
  // termId are both resolved server-side (current enrollment, current
  // term), never request fields.
  async getMyHomework(userId: string): Promise<StudentHomeworkListResponse> {
    const schoolId = this.tenantContext.schoolId;
    const studentId = await this.resolveOwnStudentId(userId);
    const classArmId = await this.resolveStudentCurrentClassArmId(studentId);
    const termId = await this.getCurrentTermId(schoolId);
    return this.homeworkService.listPublishedForStudent(classArmId, termId, studentId);
  }

  // markedDone toggles either direction through this one call — not
  // gated by past-due (a late "done" tick is still an honest signal,
  // Dami's ruling at plan time). classArmId is resolved the SAME way as
  // getMyHomework, never a request field — HomeworkService.setCompletion
  // 404s if the given homeworkId doesn't belong to that exact class.
  async markMyHomeworkDone(userId: string, homeworkId: string, dto: MarkHomeworkDoneDto): Promise<HomeworkCompletionResponse> {
    const studentId = await this.resolveOwnStudentId(userId);
    const classArmId = await this.resolveStudentCurrentClassArmId(studentId);
    return this.homeworkService.setCompletion(homeworkId, studentId, classArmId, dto.markedDone);
  }

  // v0.8.2 step 4 (SPEC_V0.8.2.md §6 item 4) — studentId AND classArmId
  // are both resolved server-side, same as markMyHomeworkDone above;
  // neither is ever a request field. Always allowed on any published
  // own-class homework (ruled at plan time — requiresUpload is
  // informational only, not an upload gate).
  async issueMyHomeworkUploadUrl(userId: string, homeworkId: string, dto: RequestUploadUrlDto): Promise<UploadUrlIssueResponse> {
    const studentId = await this.resolveOwnStudentId(userId);
    const classArmId = await this.resolveStudentCurrentClassArmId(studentId);
    return this.homeworkService.issueSubmissionUploadUrl(homeworkId, studentId, classArmId, dto);
  }

  async commitMyHomeworkSubmission(userId: string, homeworkId: string, dto: CommitFileDto): Promise<HomeworkSubmissionResponse> {
    const studentId = await this.resolveOwnStudentId(userId);
    const classArmId = await this.resolveStudentCurrentClassArmId(studentId);
    return this.homeworkService.commitSubmission(homeworkId, studentId, classArmId, dto);
  }

  // v0.8.2 step 4, flag 4 — the student-side counterpart to the teacher's
  // attachments: seeing the teacher's file is not enough without a way to
  // actually open it.
  async getMyHomeworkAttachmentDownloadUrl(userId: string, homeworkId: string, attachmentId: string): Promise<DownloadUrlResult> {
    const studentId = await this.resolveOwnStudentId(userId);
    const classArmId = await this.resolveStudentCurrentClassArmId(studentId);
    return this.homeworkService.getAttachmentDownloadUrlForStudent(homeworkId, attachmentId, classArmId);
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

  // Same reuse as getChildReportCard above: assertChildBelongsToCaller
  // runs FIRST, then role PARENT passes through to the exact same
  // ExamsService methods self-view (STUDENT) uses — the published-only
  // wall there already covers PARENT alongside STUDENT.
  async getChildExams(user: AuthenticatedUser, childId: string, query: GetStudentSubjectExamsQueryDto): Promise<StudentSubjectExamsResponse> {
    await this.assertChildBelongsToCaller(user.userId, childId);
    return this.examsService.getStudentSubjectExams(childId, query, user);
  }

  async getChildYearExams(user: AuthenticatedUser, childId: string, query: GetYearExamsQueryDto): Promise<YearExamsResponse> {
    await this.assertChildBelongsToCaller(user.userId, childId);
    return this.examsService.getStudentYearExams(childId, query, user);
  }

  // Same reuse as getChildReportCard above: assertChildBelongsToCaller
  // runs FIRST, before classArmId is ever resolved for this childId — a
  // childId outside the caller's linked set 404s there, identically to a
  // nonexistent one, before this method's own class-resolution query runs.
  async getChildTimetable(userId: string, childId: string, query: GetTimetableRangeDto): Promise<ClassTimetableResponse> {
    await this.assertChildBelongsToCaller(userId, childId);
    const classArmId = await this.resolveStudentCurrentClassArmId(childId);
    return this.calendarService.resolveClassSchedule(classArmId, query.from, query.to);
  }

  // Same reuse as getChildTimetable above: assertChildBelongsToCaller
  // runs FIRST. PARENT is read-only here by design — there is no
  // markChildHomeworkDone; the spec's own framing is "the STUDENT sets"
  // the tick, not a parent acting on the child's behalf.
  async getChildHomework(userId: string, childId: string): Promise<StudentHomeworkListResponse> {
    await this.assertChildBelongsToCaller(userId, childId);
    const schoolId = this.tenantContext.schoolId;
    const classArmId = await this.resolveStudentCurrentClassArmId(childId);
    const termId = await this.getCurrentTermId(schoolId);
    return this.homeworkService.listPublishedForStudent(classArmId, termId, childId);
  }

  // v0.8.2 step 7 (SPEC_V0.8.2.md §6 item 7) — closes the last download
  // gap flagged in Step 6: a parent could see a teacher's attachment name
  // on their child's homework but never open it. assertChildBelongsToCaller
  // runs FIRST, same ordering as every other getChild* method above; from
  // there this reuses getAttachmentDownloadUrlForStudent UNCHANGED (it
  // already takes a pre-resolved classArmId generically, no student-
  // specific logic baked in) — the own-class + PUBLISHED wall is
  // re-derived inside that same method, exactly as it already is for the
  // STUDENT path just above.
  async getChildHomeworkAttachmentDownloadUrl(userId: string, childId: string, homeworkId: string, attachmentId: string): Promise<DownloadUrlResult> {
    await this.assertChildBelongsToCaller(userId, childId);
    const classArmId = await this.resolveStudentCurrentClassArmId(childId);
    return this.homeworkService.getAttachmentDownloadUrlForStudent(homeworkId, attachmentId, classArmId);
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

  // v0.8 step 3 (SPEC_V0.8.md §7 item 3) — a TEACHER's own resolved
  // weekly schedule, across every class they teach. teacherUserId is
  // always @CurrentUser().userId (the JWT subject), never a request
  // field — mirrors findMyTeaching's own "self, from the token" shape.
  async getMyTeachingTimetable(userId: string, query: GetTimetableRangeDto): Promise<TeacherTimetableResponse> {
    return this.calendarService.resolveTeacherSchedule(userId, query.from, query.to);
  }
}
