import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { LessonStatus, UserRole, type Lesson, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { assertTeacherAssignment } from "../grades/grade-shared.util";
import { CalendarService } from "../calendar/calendar.service";
import { CreateLessonDto } from "./dto/create-lesson.dto";
import { UpdateLessonDto } from "./dto/update-lesson.dto";
import { GetLessonsQueryDto } from "./dto/get-lessons-query.dto";

export interface LessonResponse {
  id: string;
  classArmId: string;
  subjectId: string;
  teacherUserId: string;
  teacherName: string;
  sessionId: string;
  title: string;
  body: string;
  lessonDate: string;
  status: LessonStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LessonListResponse {
  classArmId: string;
  subjectId: string;
  lessons: LessonResponse[];
}

type LessonWithTeacher = Lesson & { teacherUser: User };

// v0.8.4 step 1 (SPEC_V0.8.4.md §2) — a genuinely new domain, parallel to
// HomeworkModule: no Homework/HomeworkAttachment/HomeworkSubmission/
// HomeworkCompletion table or type imported anywhere in this file, no
// grade/evaluation/exam table touched. assertTeacherAssignment is reused
// the same way homework/exams already do (a pure authorization primitive
// already treated as shared cross-domain infrastructure, not grade data
// or the publish/lock workflow). CalendarService is reused read-only —
// zero new logic added to it.
@Injectable()
export class LessonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly calendarService: CalendarService,
  ) {}

  private async getCurrentSession(schoolId: string) {
    const session = await this.prisma.academicSession.findFirst({ where: forSchool(schoolId, { isCurrent: true }) });
    if (!session) {
      throw new BadRequestException("No current academic session configured for this school.");
    }
    return session;
  }

  // Mirrors homework's isDueDatePast (v0.8.2 step 2) almost verbatim,
  // just inverted: a lesson date is invalid once it's AFTER today, not
  // before. Pure UTC date math, no time-of-day. Kept private/injectable
  // with a real default (now: Date = new Date()) for the same reason
  // isDueDatePast is — no frontend consumer needs a byte-identical
  // evaluation yet in this backend-only step, so it isn't promoted to
  // packages/shared.
  private isDateInTheFuture(dateStr: string, now: Date = new Date()): boolean {
    const [year, month, day] = dateStr.split("-").map(Number);
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Date.UTC(year, month - 1, day) > todayUTC;
  }

  // THE lesson-date rule (SPEC_V0.8.4.md §3) — the one genuine inversion
  // of homework's due-date rule: lessonDate must be on or BEFORE today
  // (you log what was taught), a school day for this class (REUSES
  // isSchoolDayForClassOnDate — a holiday/Sunday/disabled-Saturday
  // rejects, same short-circuit-before-the-slot-query order homework's
  // own rule uses), and a weekday this teacher actually teaches this
  // class (REUSES teacherTeachesClassOnDate, day-level, any period — the
  // exact method homework's due-date rule uses, unmodified). "Within the
  // current session" falls out of teacherTeachesClassOnDate's own session
  // resolution for free — nothing extra to check. Called from BOTH
  // createLesson and updateLesson (only when lessonDate changes) —
  // mirrors updateHomework's exact dueDate-changed gate: editing a
  // lesson's title/body on some later day never re-triggers this.
  private async assertLessonDateIsATeachingDay(schoolId: string, classArmId: string, lessonDate: string, teacherUserId: string): Promise<void> {
    const message = "The lesson date must be a school day you teach this class, on or before today.";
    if (this.isDateInTheFuture(lessonDate)) {
      throw new BadRequestException(message);
    }
    const isSchoolDay = await this.calendarService.isSchoolDayForClassOnDate(schoolId, classArmId, lessonDate);
    const teachesThatDay = isSchoolDay && (await this.calendarService.teacherTeachesClassOnDate(schoolId, teacherUserId, classArmId, lessonDate));
    if (!teachesThatDay) {
      throw new BadRequestException(message);
    }
  }

  private toLessonResponse(lesson: LessonWithTeacher): LessonResponse {
    return {
      id: lesson.id,
      classArmId: lesson.classArmId,
      subjectId: lesson.subjectId,
      teacherUserId: lesson.teacherUserId,
      teacherName: `${lesson.teacherUser.firstName} ${lesson.teacherUser.lastName}`,
      sessionId: lesson.sessionId,
      title: lesson.title,
      body: lesson.body,
      lessonDate: lesson.lessonDate.toISOString().slice(0, 10),
      status: lesson.status,
      publishedAt: lesson.publishedAt,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
    };
  }

  // Teacher's own authoring list — scoped by classArmId+subjectId+current
  // session (no termId: this model has none). assertTeacherAssignment
  // scopes a TEACHER to their own assignment (403 otherwise); SCHOOL_ADMIN/
  // PROPRIETOR are existence-checked only (404 if no teacher is assigned
  // at all) — same shape as listHomework.
  async listLessons(query: GetLessonsQueryDto, user: AuthenticatedUser): Promise<LessonListResponse> {
    const schoolId = this.tenantContext.schoolId;
    const session = await this.getCurrentSession(schoolId);
    await assertTeacherAssignment(this.prisma, schoolId, user, query.subjectId, query.classArmId, session.id);

    const lessons = await this.prisma.lesson.findMany({
      where: { schoolId, classArmId: query.classArmId, subjectId: query.subjectId, sessionId: session.id, deletedAt: null },
      include: { teacherUser: true },
      orderBy: { lessonDate: "desc" },
    });

    return {
      classArmId: query.classArmId,
      subjectId: query.subjectId,
      lessons: lessons.map((row) => this.toLessonResponse(row)),
    };
  }

  // TEACHER-only (homework's own "teachers own it entirely" model).
  async createLesson(dto: CreateLessonDto, user: AuthenticatedUser): Promise<LessonResponse> {
    const schoolId = this.tenantContext.schoolId;
    const session = await this.getCurrentSession(schoolId);
    await assertTeacherAssignment(this.prisma, schoolId, user, dto.subjectId, dto.classArmId, session.id);
    await this.assertLessonDateIsATeachingDay(schoolId, dto.classArmId, dto.lessonDate, user.userId);

    const lesson = await this.prisma.lesson.create({
      data: {
        schoolId,
        classArmId: dto.classArmId,
        subjectId: dto.subjectId,
        teacherUserId: user.userId,
        sessionId: session.id,
        title: dto.title,
        body: dto.body,
        lessonDate: new Date(`${dto.lessonDate}T00:00:00Z`),
      },
      include: { teacherUser: true },
    });

    return this.toLessonResponse(lesson);
  }

  // Edit title/body/lessonDate only — classArmId/subjectId are immutable.
  // Frozen once PUBLISHED for everyone — unpublish first (identical rule
  // to updateHomework). Authority is the CURRENT assertTeacherAssignment,
  // not lesson.teacherUserId — a reassigned teacher inherits authority
  // over the class's existing lessons, same as homework/evaluations.
  async updateLesson(lessonId: string, dto: UpdateLessonDto, user: AuthenticatedUser): Promise<LessonResponse> {
    if (dto.title === undefined && dto.body === undefined && dto.lessonDate === undefined) {
      throw new BadRequestException("At least one field must be provided.");
    }

    const schoolId = this.tenantContext.schoolId;
    const lesson = await this.prisma.lesson.findFirst({ where: forSchool(schoolId, { id: lessonId, deletedAt: null }) });
    if (!lesson) {
      throw new NotFoundException("Lesson not found.");
    }
    await assertTeacherAssignment(this.prisma, schoolId, user, lesson.subjectId, lesson.classArmId, lesson.sessionId);

    if (lesson.status === LessonStatus.PUBLISHED) {
      throw new ForbiddenException("Cannot edit lesson once it's published — unpublish first.");
    }

    if (dto.lessonDate !== undefined) {
      await this.assertLessonDateIsATeachingDay(schoolId, lesson.classArmId, dto.lessonDate, user.userId);
    }

    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        title: dto.title ?? lesson.title,
        body: dto.body ?? lesson.body,
        lessonDate: dto.lessonDate !== undefined ? new Date(`${dto.lessonDate}T00:00:00Z`) : lesson.lessonDate,
      },
      include: { teacherUser: true },
    });

    return this.toLessonResponse(updated);
  }

  // TEACHER: their own currently-assigned DRAFT only (blocked once
  // PUBLISHED — unpublish first). SCHOOL_ADMIN/PROPRIETOR: any status,
  // any assignment — a safety net, mirroring deleteHomework's exact
  // authorization shape.
  async deleteLesson(lessonId: string, user: AuthenticatedUser): Promise<{ id: string }> {
    const schoolId = this.tenantContext.schoolId;
    const lesson = await this.prisma.lesson.findFirst({ where: forSchool(schoolId, { id: lessonId, deletedAt: null }) });
    if (!lesson) {
      throw new NotFoundException("Lesson not found.");
    }

    const isAdminOverride = user.role === UserRole.SCHOOL_ADMIN || user.role === UserRole.PROPRIETOR;
    if (!isAdminOverride) {
      await assertTeacherAssignment(this.prisma, schoolId, user, lesson.subjectId, lesson.classArmId, lesson.sessionId);
      if (lesson.status === LessonStatus.PUBLISHED) {
        throw new ConflictException("Cannot delete: this lesson is already published — unpublish it first.");
      }
    }

    await this.prisma.lesson.update({ where: { id: lessonId }, data: { deletedAt: new Date() } });
    return { id: lessonId };
  }

  // TEACHER-only, categorical — matches publishHomework's own narrowing
  // (no admin override on publish itself; the override lives on unpublish
  // and delete only).
  async publishLesson(lessonId: string, user: AuthenticatedUser): Promise<LessonResponse> {
    const schoolId = this.tenantContext.schoolId;
    const lesson = await this.prisma.lesson.findFirst({ where: forSchool(schoolId, { id: lessonId, deletedAt: null }) });
    if (!lesson) {
      throw new NotFoundException("Lesson not found.");
    }
    await assertTeacherAssignment(this.prisma, schoolId, user, lesson.subjectId, lesson.classArmId, lesson.sessionId);

    if (lesson.status === LessonStatus.PUBLISHED) {
      throw new ConflictException("This lesson is already published.");
    }

    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { status: LessonStatus.PUBLISHED, publishedAt: new Date() },
      include: { teacherUser: true },
    });

    return this.toLessonResponse(updated);
  }

  // TEACHER (their own currently-assigned lesson) or SCHOOL_ADMIN/
  // PROPRIETOR (any) — the same safety-valve shape as unpublishHomework.
  async unpublishLesson(lessonId: string, user: AuthenticatedUser): Promise<LessonResponse> {
    const schoolId = this.tenantContext.schoolId;
    const lesson = await this.prisma.lesson.findFirst({ where: forSchool(schoolId, { id: lessonId, deletedAt: null }) });
    if (!lesson) {
      throw new NotFoundException("Lesson not found.");
    }

    const isAdminOverride = user.role === UserRole.SCHOOL_ADMIN || user.role === UserRole.PROPRIETOR;
    if (!isAdminOverride) {
      await assertTeacherAssignment(this.prisma, schoolId, user, lesson.subjectId, lesson.classArmId, lesson.sessionId);
    }

    if (lesson.status !== LessonStatus.PUBLISHED) {
      throw new ConflictException("This lesson is not published.");
    }

    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { status: LessonStatus.DRAFT, publishedAt: null },
      include: { teacherUser: true },
    });

    return this.toLessonResponse(updated);
  }
}
