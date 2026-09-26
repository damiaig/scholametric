import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HomeworkStatus, UserRole, type Homework, type Term, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { assertTeacherAssignment } from "../grades/grade-shared.util";
import { CalendarService } from "../calendar/calendar.service";
import { CreateHomeworkDto } from "./dto/create-homework.dto";
import { UpdateHomeworkDto } from "./dto/update-homework.dto";
import { GetHomeworkQueryDto } from "./dto/get-homework-query.dto";

export interface HomeworkResponse {
  id: string;
  classArmId: string;
  subjectId: string;
  teacherUserId: string;
  teacherName: string;
  sessionId: string;
  termId: string;
  title: string;
  description: string;
  dueDate: string;
  requiresUpload: boolean;
  status: HomeworkStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HomeworkListResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  homework: HomeworkResponse[];
}

type HomeworkWithTeacher = Homework & { teacherUser: User };

// v0.8.2 step 1 (SPEC_V0.8.2.md §6 item 1) — a genuinely new domain: no
// Evaluation/Score/TermResult table read or written, no term-lock/
// advisory-lock machinery reused (Homework has no term-close concept in
// this spec). assertTeacherAssignment is imported directly from the
// grades module, same as exams.service.ts already does — a pure
// authorization primitive already treated as cross-domain infrastructure
// in this codebase, not grade data or the publish/lock workflow.
@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly calendarService: CalendarService,
  ) {}

  // Mirrors grades' resolveTenantScopeSubjectOnly in shape (classArm/
  // subject/term all exist and belong to this school, 404 otherwise) but
  // reimplemented locally rather than imported — that helper is grades-
  // specific plumbing, unlike assertTeacherAssignment which is already
  // shared cross-domain infrastructure.
  private async resolveTenantScope(
    schoolId: string,
    ids: { classArmId: string; subjectId: string; termId: string },
  ): Promise<{ term: Term }> {
    const [classArm, subject, term] = await Promise.all([
      this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: ids.classArmId }) }),
      this.prisma.subject.findFirst({ where: forSchool(schoolId, { id: ids.subjectId, deletedAt: null }) }),
      this.prisma.term.findFirst({ where: forSchool(schoolId, { id: ids.termId }) }),
    ]);
    if (!classArm) throw new NotFoundException("Class arm not found.");
    if (!subject) throw new NotFoundException("Subject not found.");
    if (!term) throw new NotFoundException("Term not found.");
    return { term };
  }

  // SPEC_V0.8.2.md §6 item 1 — REUSES CalendarService.isSchoolDayForClassOnDate
  // (made public for this call, no logic reimplemented) so a holiday,
  // disabled Saturday, or Sunday due date all reject the same way a
  // resolved schedule would treat that date.
  private async assertDueDateIsSchoolDay(schoolId: string, classArmId: string, dueDate: string): Promise<void> {
    const isSchoolDay = await this.calendarService.isSchoolDayForClassOnDate(schoolId, classArmId, dueDate);
    if (!isSchoolDay) {
      throw new BadRequestException("The due date must be a school day for this class.");
    }
  }

  private toHomeworkResponse(homework: HomeworkWithTeacher): HomeworkResponse {
    return {
      id: homework.id,
      classArmId: homework.classArmId,
      subjectId: homework.subjectId,
      teacherUserId: homework.teacherUserId,
      teacherName: `${homework.teacherUser.firstName} ${homework.teacherUser.lastName}`,
      sessionId: homework.sessionId,
      termId: homework.termId,
      title: homework.title,
      description: homework.description,
      dueDate: homework.dueDate.toISOString().slice(0, 10),
      requiresUpload: homework.requiresUpload,
      status: homework.status,
      publishedAt: homework.publishedAt,
      createdAt: homework.createdAt,
      updatedAt: homework.updatedAt,
    };
  }

  async listHomework(query: GetHomeworkQueryDto, user: AuthenticatedUser): Promise<HomeworkListResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await this.resolveTenantScope(schoolId, query);
    await assertTeacherAssignment(this.prisma, schoolId, user, query.subjectId, query.classArmId, term.sessionId);

    const homework = await this.prisma.homework.findMany({
      where: { schoolId, classArmId: query.classArmId, subjectId: query.subjectId, termId: query.termId, deletedAt: null },
      include: { teacherUser: true },
      orderBy: { dueDate: "asc" },
    });

    return {
      classArmId: query.classArmId,
      subjectId: query.subjectId,
      termId: query.termId,
      homework: homework.map((row) => this.toHomeworkResponse(row)),
    };
  }

  // TEACHER-only (v0.7.4's "teachers own it entirely" model, not the
  // evaluations-precedent's PROPRIETOR-only delete — nothing in this spec
  // asks for that split). classArmId/subjectId/termId are the DTO's real
  // scoping input; sessionId is derived server-side from the term, never
  // a client input.
  async createHomework(dto: CreateHomeworkDto, user: AuthenticatedUser): Promise<HomeworkResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await this.resolveTenantScope(schoolId, dto);
    await assertTeacherAssignment(this.prisma, schoolId, user, dto.subjectId, dto.classArmId, term.sessionId);
    await this.assertDueDateIsSchoolDay(schoolId, dto.classArmId, dto.dueDate);

    const homework = await this.prisma.homework.create({
      data: {
        schoolId,
        classArmId: dto.classArmId,
        subjectId: dto.subjectId,
        teacherUserId: user.userId,
        sessionId: term.sessionId,
        termId: dto.termId,
        title: dto.title,
        description: dto.description,
        dueDate: new Date(`${dto.dueDate}T00:00:00Z`),
        requiresUpload: dto.requiresUpload,
      },
      include: { teacherUser: true },
    });

    return this.toHomeworkResponse(homework);
  }

  // Edit title/description/dueDate/requiresUpload only — classArmId/
  // subjectId/termId are immutable, same reasoning as UpdateEvaluationDto.
  // Frozen once PUBLISHED for everyone — unpublish first (identical rule
  // to updateEvaluation). Authority is the CURRENT assertTeacherAssignment,
  // not homework.teacherUserId — a reassigned teacher inherits authority
  // over the class's existing homework, same as evaluations.
  async updateHomework(homeworkId: string, dto: UpdateHomeworkDto, user: AuthenticatedUser): Promise<HomeworkResponse> {
    if (dto.title === undefined && dto.description === undefined && dto.dueDate === undefined && dto.requiresUpload === undefined) {
      throw new BadRequestException("At least one field must be provided.");
    }

    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findFirst({ where: forSchool(schoolId, { id: homeworkId, deletedAt: null }) });
    if (!homework) {
      throw new NotFoundException("Homework not found.");
    }
    await assertTeacherAssignment(this.prisma, schoolId, user, homework.subjectId, homework.classArmId, homework.sessionId);

    if (homework.status === HomeworkStatus.PUBLISHED) {
      throw new ForbiddenException("Cannot edit homework once it's published — unpublish first.");
    }

    if (dto.dueDate !== undefined) {
      await this.assertDueDateIsSchoolDay(schoolId, homework.classArmId, dto.dueDate);
    }

    const updated = await this.prisma.homework.update({
      where: { id: homeworkId },
      data: {
        title: dto.title ?? homework.title,
        description: dto.description ?? homework.description,
        dueDate: dto.dueDate !== undefined ? new Date(`${dto.dueDate}T00:00:00Z`) : homework.dueDate,
        requiresUpload: dto.requiresUpload ?? homework.requiresUpload,
      },
      include: { teacherUser: true },
    });

    return this.toHomeworkResponse(updated);
  }

  // TEACHER: their own currently-assigned DRAFT only (blocked once
  // PUBLISHED — unpublish first). SCHOOL_ADMIN/PROPRIETOR: any status,
  // any assignment — a safety net (teacher left the school, cleanup),
  // per Dami's ruling over the evaluations precedent (delete there is
  // PROPRIETOR-only categorically; that was a v0.7.x-specific split that
  // doesn't apply to this "teacher owns it" domain).
  async deleteHomework(homeworkId: string, user: AuthenticatedUser): Promise<{ id: string }> {
    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findFirst({ where: forSchool(schoolId, { id: homeworkId, deletedAt: null }) });
    if (!homework) {
      throw new NotFoundException("Homework not found.");
    }

    const isAdminOverride = user.role === UserRole.SCHOOL_ADMIN || user.role === UserRole.PROPRIETOR;
    if (!isAdminOverride) {
      await assertTeacherAssignment(this.prisma, schoolId, user, homework.subjectId, homework.classArmId, homework.sessionId);
      if (homework.status === HomeworkStatus.PUBLISHED) {
        throw new ConflictException("Cannot delete: this homework is already published — unpublish it first.");
      }
    }

    await this.prisma.homework.update({ where: { id: homeworkId }, data: { deletedAt: new Date() } });
    return { id: homeworkId };
  }

  // TEACHER-only, categorical — matches publishEvaluation's own "teachers
  // own evaluations entirely" narrowing. No completeness gate (no roster/
  // scores here, unlike grades) — publishing just flips visibility on for
  // Step 2's student/parent views.
  async publishHomework(homeworkId: string, user: AuthenticatedUser): Promise<HomeworkResponse> {
    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findFirst({ where: forSchool(schoolId, { id: homeworkId, deletedAt: null }) });
    if (!homework) {
      throw new NotFoundException("Homework not found.");
    }
    await assertTeacherAssignment(this.prisma, schoolId, user, homework.subjectId, homework.classArmId, homework.sessionId);

    if (homework.status === HomeworkStatus.PUBLISHED) {
      throw new ConflictException("This homework is already published.");
    }

    const updated = await this.prisma.homework.update({
      where: { id: homeworkId },
      data: { status: HomeworkStatus.PUBLISHED, publishedAt: new Date() },
      include: { teacherUser: true },
    });

    return this.toHomeworkResponse(updated);
  }

  // TEACHER (their own currently-assigned homework) or SCHOOL_ADMIN/
  // PROPRIETOR (any) — the same safety-valve shape as unpublishEvaluation.
  async unpublishHomework(homeworkId: string, user: AuthenticatedUser): Promise<HomeworkResponse> {
    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findFirst({ where: forSchool(schoolId, { id: homeworkId, deletedAt: null }) });
    if (!homework) {
      throw new NotFoundException("Homework not found.");
    }

    const isAdminOverride = user.role === UserRole.SCHOOL_ADMIN || user.role === UserRole.PROPRIETOR;
    if (!isAdminOverride) {
      await assertTeacherAssignment(this.prisma, schoolId, user, homework.subjectId, homework.classArmId, homework.sessionId);
    }

    if (homework.status !== HomeworkStatus.PUBLISHED) {
      throw new ConflictException("This homework is not published.");
    }

    const updated = await this.prisma.homework.update({
      where: { id: homeworkId },
      data: { status: HomeworkStatus.DRAFT, publishedAt: null },
      include: { teacherUser: true },
    });

    return this.toHomeworkResponse(updated);
  }
}
