import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { LessonStatus, UserRole, type Lesson, type Subject, type User } from "@prisma/client";
import type { LessonTeachingWeekdaysResponse, StudentLessonEntry, StudentLessonListResponse } from "@scholametric/shared";
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
type LessonWithSubjectAndTeacher = Lesson & { subject: Subject; teacherUser: User };

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

  private toStudentLessonEntry(lesson: LessonWithSubjectAndTeacher): StudentLessonEntry {
    return {
      id: lesson.id,
      subjectId: lesson.subjectId,
      subjectName: lesson.subject.name,
      teacherName: `${lesson.teacherUser.firstName} ${lesson.teacherUser.lastName}`,
      title: lesson.title,
      body: lesson.body,
      lessonDate: lesson.lessonDate.toISOString().slice(0, 10),
      // Always [] until step 3 — LessonAttachment doesn't exist as a
      // table yet; the response shape is forward-declared now so it
      // doesn't change again then.
      attachments: [],
    };
  }

  // v0.8.4 step 2 (SPEC_V0.8.4.md §4.2) — the student+parent read, scoped
  // by classArmId ONLY. Unlike homework's listPublishedForStudent (which
  // needs studentId to join HomeworkCompletion/HomeworkSubmission), a
  // Lesson has ZERO per-student state — the response is identical for
  // every student in the class, so MeService's student and parent paths
  // both converge on this exact same call, differing only in how
  // classArmId gets resolved upstream. PUBLISHED-only, newest-lessonDate-
  // first (cahier de textes framing). No 404 here: a classArmId with zero
  // published lessons is a legitimate empty list, not an error — the
  // 404-not-403 walls (own enrollment / own linked child) are enforced by
  // the callers resolving classArmId, not by this method.
  async listPublishedLessonsForClass(classArmId: string): Promise<StudentLessonListResponse> {
    const schoolId = this.tenantContext.schoolId;
    const session = await this.getCurrentSession(schoolId);
    const lessons = await this.prisma.lesson.findMany({
      where: { schoolId, classArmId, sessionId: session.id, status: LessonStatus.PUBLISHED, deletedAt: null },
      include: { subject: true, teacherUser: true },
      orderBy: { lessonDate: "desc" },
    });

    return {
      classArmId,
      lessons: lessons.map((row) => this.toStudentLessonEntry(row)),
    };
  }

  // v0.8.4 step 2 (SPEC_V0.8.4.md §6 step 2) — the lessonDate picker's
  // data source for the create form. Reuses
  // CalendarService.teacherTeachingWeekdaysForClass, the EXACT method
  // homework's own GET /homework/teaching-weekdays wraps — a thin
  // endpoint, not a reimplementation. Reuses getCurrentSession (above)
  // instead of re-inlining the same academicSession lookup a second time
  // the way homework's own version does.
  async getTeachingWeekdays(classArmId: string, subjectId: string, user: AuthenticatedUser): Promise<LessonTeachingWeekdaysResponse> {
    const schoolId = this.tenantContext.schoolId;
    const session = await this.getCurrentSession(schoolId);
    await assertTeacherAssignment(this.prisma, schoolId, user, subjectId, classArmId, session.id);
    const weekdays = await this.calendarService.teacherTeachingWeekdaysForClass(schoolId, user.userId, classArmId);
    return { weekdays };
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
