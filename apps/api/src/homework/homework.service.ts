import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { HomeworkStatus, UserRole, type Homework, type HomeworkAttachment, type HomeworkSubmission, type Subject, type Term, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { assertTeacherAssignment, getRoster } from "../grades/grade-shared.util";
import { CalendarService } from "../calendar/calendar.service";
import { StorageService, type DownloadUrlResult } from "../storage/storage.service";
import { HOMEWORK_ATTACHMENT_CAP_BYTES, HOMEWORK_SUBMISSION_CAP_BYTES } from "./homework.constants";
import { CreateHomeworkDto } from "./dto/create-homework.dto";
import { UpdateHomeworkDto } from "./dto/update-homework.dto";
import { GetHomeworkQueryDto } from "./dto/get-homework-query.dto";
import { RequestUploadUrlDto } from "./dto/request-upload-url.dto";
import { CommitFileDto } from "./dto/commit-file.dto";

export interface HomeworkAttachmentResponse {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface HomeworkSubmissionResponse {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export interface UploadUrlIssueResponse {
  uploadUrl: string;
  storageKey: string;
  expiresAt: Date;
  maxSizeBytes: number;
}

export interface HomeworkSubmissionsView {
  homeworkId: string;
  students: Array<{
    studentId: string;
    studentName: string;
    markedDone: boolean;
    markedAt: string | null;
    submissions: HomeworkSubmissionResponse[];
  }>;
}

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
  attachments: HomeworkAttachmentResponse[];
}

export interface HomeworkListResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  homework: HomeworkResponse[];
}

// v0.8.2 step 2 (SPEC_V0.8.2.md §6 item 2) — the STUDENT/PARENT read
// shape: a flat list, sorted by dueDate — NOT pre-grouped into "Pour
// lundi 28 sept"-style buckets. Grouping-by-due-date is a rendering
// concern for whichever step builds the actual page; this just answers
// "what's due, in order, with my own completion status."
export interface StudentHomeworkEntry {
  id: string;
  subjectId: string;
  subjectName: string;
  teacherName: string;
  title: string;
  description: string;
  dueDate: string;
  requiresUpload: boolean;
  markedDone: boolean;
  markedAt: string | null;
  attachments: HomeworkAttachmentResponse[];
}

export interface StudentHomeworkListResponse {
  classArmId: string;
  homework: StudentHomeworkEntry[];
}

export interface HomeworkCompletionResponse {
  homeworkId: string;
  markedDone: boolean;
  markedAt: string | null;
}

type HomeworkWithTeacher = Homework & { teacherUser: User; attachments: HomeworkAttachment[] };
type HomeworkWithSubjectAndTeacher = Homework & { subject: Subject; teacherUser: User; attachments: HomeworkAttachment[] };

// v0.8.2 step 1 (SPEC_V0.8.2.md §6 item 1) — a genuinely new domain: no
// Evaluation/Score/TermResult table read or written, no term-lock/
// advisory-lock machinery reused (Homework has no term-close concept in
// this spec). assertTeacherAssignment is imported directly from the
// grades module, same as exams.service.ts already does — a pure
// authorization primitive already treated as cross-domain infrastructure
// in this codebase, not grade data or the publish/lock workflow.
@Injectable()
export class HomeworkService {
  private readonly logger = new Logger(HomeworkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly calendarService: CalendarService,
    private readonly storageService: StorageService,
  ) {}

  // v0.8.2 step 4 — server-generated, never client-supplied (the client
  // only ever gets the resulting storageKey back from issueUploadUrl).
  // The random UUID is what makes a sibling key unguessable; the prefix
  // shape is what the commit-time check below validates against.
  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
  }

  private attachmentPrefix(schoolId: string, homeworkId: string): string {
    return `schools/${schoolId}/homework/${homeworkId}/attachments/`;
  }

  private submissionPrefix(schoolId: string, homeworkId: string, studentId: string): string {
    return `schools/${schoolId}/homework/${homeworkId}/submissions/${studentId}/`;
  }

  private buildAttachmentStorageKey(schoolId: string, homeworkId: string, fileName: string): string {
    return `${this.attachmentPrefix(schoolId, homeworkId)}${randomUUID()}-${this.sanitizeFileName(fileName)}`;
  }

  private buildSubmissionStorageKey(schoolId: string, homeworkId: string, studentId: string, fileName: string): string {
    return `${this.submissionPrefix(schoolId, homeworkId, studentId)}${randomUUID()}-${this.sanitizeFileName(fileName)}`;
  }

  private async sumAttachmentSizes(homeworkId: string): Promise<number> {
    const result = await this.prisma.homeworkAttachment.aggregate({ where: { homeworkId }, _sum: { sizeBytes: true } });
    return result._sum.sizeBytes ?? 0;
  }

  private async sumSubmissionSizes(homeworkId: string, studentId: string): Promise<number> {
    const result = await this.prisma.homeworkSubmission.aggregate({ where: { homeworkId, studentId }, _sum: { sizeBytes: true } });
    return result._sum.sizeBytes ?? 0;
  }

  private toAttachmentResponse(attachment: HomeworkAttachment): HomeworkAttachmentResponse {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      createdAt: attachment.createdAt,
    };
  }

  private toSubmissionResponse(submission: HomeworkSubmission): HomeworkSubmissionResponse {
    return {
      id: submission.id,
      fileName: submission.fileName,
      contentType: submission.contentType,
      sizeBytes: submission.sizeBytes,
      uploadedAt: submission.uploadedAt,
    };
  }

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

  // v0.8.2 step 2 (SPEC_V0.8.2.md §6 item 2, Item 8) — sibling to
  // isPeriodTimePast (v0.8.1), but pure-date, no time-of-day: a homework
  // due TODAY is still visible, it only drops off the day AFTER its due
  // date passes. Kept LOCAL/private, not promoted to packages/shared —
  // unlike isPeriodTimePast, there's no frontend consumer in this step
  // needing a byte-identical browser+server evaluation yet. Promote it
  // when the student-facing page actually needs to match this exact
  // rule client-side.
  private isDueDatePast(dueDate: string, now: Date = new Date()): boolean {
    const [year, month, day] = dueDate.split("-").map(Number);
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Date.UTC(year, month - 1, day) < todayUTC;
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
      attachments: homework.attachments.map((attachment) => this.toAttachmentResponse(attachment)),
    };
  }

  private toStudentHomeworkEntry(homework: HomeworkWithSubjectAndTeacher, completion: { markedDone: boolean; markedAt: Date | null } | undefined): StudentHomeworkEntry {
    return {
      id: homework.id,
      subjectId: homework.subjectId,
      subjectName: homework.subject.name,
      teacherName: `${homework.teacherUser.firstName} ${homework.teacherUser.lastName}`,
      title: homework.title,
      description: homework.description,
      dueDate: homework.dueDate.toISOString().slice(0, 10),
      requiresUpload: homework.requiresUpload,
      markedDone: completion?.markedDone ?? false,
      markedAt: completion?.markedAt?.toISOString() ?? null,
      attachments: homework.attachments.map((attachment) => this.toAttachmentResponse(attachment)),
    };
  }

  async listHomework(query: GetHomeworkQueryDto, user: AuthenticatedUser): Promise<HomeworkListResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await this.resolveTenantScope(schoolId, query);
    await assertTeacherAssignment(this.prisma, schoolId, user, query.subjectId, query.classArmId, term.sessionId);

    const homework = await this.prisma.homework.findMany({
      where: { schoolId, classArmId: query.classArmId, subjectId: query.subjectId, termId: query.termId, deletedAt: null },
      include: { teacherUser: true, attachments: { orderBy: { createdAt: "asc" } } },
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
      include: { teacherUser: true, attachments: { orderBy: { createdAt: "asc" } } },
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
      include: { teacherUser: true, attachments: { orderBy: { createdAt: "asc" } } },
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
      include: { teacherUser: true, attachments: { orderBy: { createdAt: "asc" } } },
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
      include: { teacherUser: true, attachments: { orderBy: { createdAt: "asc" } } },
    });

    return this.toHomeworkResponse(updated);
  }

  // v0.8.2 step 2 (SPEC_V0.8.2.md §6 item 2) — classArmId AND termId are
  // both caller-resolved (never request fields): MeService resolves
  // classArmId from the caller's own current enrollment, termId from
  // "whichever Term.isCurrent is true for this school" — the same current-
  // term resolution findMyTeaching already does inline, nothing new. Both
  // matter: ClassArm is a PERMANENT entity (no sessionId/termId of its
  // own — the same "JSS 2 A" row persists across every year), so
  // classArmId alone would surface every homework ever assigned to that
  // class across every past term/session, forever. Only PUBLISHED, only
  // not-yet-past-due (Step 1's teacher-facing listHomework is completely
  // untouched — the teacher keeps seeing everything, any status, any age).
  async listPublishedForStudent(classArmId: string, termId: string, studentId: string): Promise<StudentHomeworkListResponse> {
    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findMany({
      where: { schoolId, classArmId, termId, status: HomeworkStatus.PUBLISHED, deletedAt: null },
      include: { subject: true, teacherUser: true, attachments: { orderBy: { createdAt: "asc" } } },
      orderBy: { dueDate: "asc" },
    });
    const visible = homework.filter((row) => !this.isDueDatePast(row.dueDate.toISOString().slice(0, 10)));

    const completions = await this.prisma.homeworkCompletion.findMany({
      where: { schoolId, studentId, homeworkId: { in: visible.map((row) => row.id) } },
    });
    const completionByHomeworkId = new Map(completions.map((completion) => [completion.homeworkId, completion]));

    return {
      classArmId,
      homework: visible.map((row) => this.toStudentHomeworkEntry(row, completionByHomeworkId.get(row.id))),
    };
  }

  // classArmId is always the caller's own server-resolved current class
  // (never a request field) — a homeworkId from a different class simply
  // doesn't match this filter and 404s, collapsing "doesn't exist,"
  // "wrong class," and "not yet published" into the same response so a
  // caller can never distinguish which case it was (the same "hidden, not
  // forbidden" posture every other own-X wall in this codebase takes).
  // NOT gated by past-due — a late "done" tick after a homework has
  // dropped off the default list is still an honest, valid signal.
  async setCompletion(homeworkId: string, studentId: string, classArmId: string, markedDone: boolean): Promise<HomeworkCompletionResponse> {
    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findFirst({
      where: forSchool(schoolId, { id: homeworkId, classArmId, status: HomeworkStatus.PUBLISHED, deletedAt: null }),
    });
    if (!homework) {
      throw new NotFoundException("Homework not found.");
    }

    const markedAt = markedDone ? new Date() : null;
    const completion = await this.prisma.homeworkCompletion.upsert({
      where: { homeworkId_studentId: { homeworkId, studentId } },
      create: { schoolId, homeworkId, studentId, markedDone, markedAt },
      update: { markedDone, markedAt },
    });

    return { homeworkId, markedDone: completion.markedDone, markedAt: completion.markedAt?.toISOString() ?? null };
  }

  // v0.8.2 step 4 (SPEC_V0.8.2.md §6 item 4) — CHECKPOINT 1 of 2. Issues a
  // signed upload URL capped at the REMAINING budget (never the client's
  // declared size, which this DTO doesn't even carry) — StorageService
  // bakes that cap into the URL itself (step 3), so the storage layer
  // physically can't accept more than what's left. Ruled at plan time:
  // attachments are NOT frozen post-publish (adding a file ≠ changing the
  // assignment's text), so no status check here.
  async issueAttachmentUploadUrl(homeworkId: string, dto: RequestUploadUrlDto, user: AuthenticatedUser): Promise<UploadUrlIssueResponse> {
    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findFirst({ where: forSchool(schoolId, { id: homeworkId, deletedAt: null }) });
    if (!homework) {
      throw new NotFoundException("Homework not found.");
    }
    await assertTeacherAssignment(this.prisma, schoolId, user, homework.subjectId, homework.classArmId, homework.sessionId);

    const used = await this.sumAttachmentSizes(homeworkId);
    const remaining = HOMEWORK_ATTACHMENT_CAP_BYTES - used;
    if (remaining <= 0) {
      throw new ConflictException("This homework has already reached its 20MB attachment cap.");
    }

    const storageKey = this.buildAttachmentStorageKey(schoolId, homeworkId, dto.fileName);
    const issued = await this.storageService.issueUploadUrl({ storageKey, contentType: dto.contentType, maxSizeBytes: remaining });
    return { uploadUrl: issued.uploadUrl, storageKey: issued.storageKey, expiresAt: issued.expiresAt, maxSizeBytes: remaining };
  }

  // CHECKPOINT 2 of 2 — commits the row using StorageService.
  // getObjectMetadata's VERIFIED actual size, never a client-declared one.
  // The storageKey prefix check is the tenant-isolation guard: a caller
  // can only ever reference a key under their own (schoolId, homeworkId)
  // path, and the random UUID in that path makes guessing a sibling key
  // (e.g. another school's real attachment) infeasible. Re-sums the
  // budget here too (not just at issue) to close the race where two
  // uploads are issued concurrently, each fitting its own snapshot but
  // not the combined total — on that rejection the now-useless upload is
  // deleted rather than left as a storage orphan.
  async commitAttachment(homeworkId: string, dto: CommitFileDto, user: AuthenticatedUser): Promise<HomeworkAttachmentResponse> {
    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findFirst({ where: forSchool(schoolId, { id: homeworkId, deletedAt: null }) });
    if (!homework) {
      throw new NotFoundException("Homework not found.");
    }
    await assertTeacherAssignment(this.prisma, schoolId, user, homework.subjectId, homework.classArmId, homework.sessionId);

    if (!dto.storageKey.startsWith(this.attachmentPrefix(schoolId, homeworkId))) {
      throw new BadRequestException("Invalid storage key.");
    }

    const metadata = await this.storageService.getObjectMetadata(dto.storageKey);
    if (!metadata) {
      throw new BadRequestException("No file found at this location — the upload may not have completed.");
    }

    const used = await this.sumAttachmentSizes(homeworkId);
    if (used + metadata.sizeBytes > HOMEWORK_ATTACHMENT_CAP_BYTES) {
      await this.storageService.deleteObject(dto.storageKey);
      throw new ConflictException("This file would exceed the 20MB attachment cap for this homework.");
    }

    const attachment = await this.prisma.homeworkAttachment.create({
      data: {
        schoolId,
        homeworkId,
        storageKey: dto.storageKey,
        fileName: dto.fileName,
        contentType: metadata.contentType,
        sizeBytes: metadata.sizeBytes,
      },
    });
    return this.toAttachmentResponse(attachment);
  }

  // v0.8.2 step 4 — mirrors issueAttachmentUploadUrl's own two-checkpoint
  // shape onto student submissions. Own-class + PUBLISHED scoping is
  // IDENTICAL to setCompletion's own 404 shape (classArmId/studentId are
  // always caller-resolved, never request fields — MeService's job).
  // Ruled at plan time: upload is ALWAYS allowed on any published
  // own-class homework, not gated by requiresUpload (which stays purely
  // informational) — symmetric with mark-done being a free-standing
  // signal ("not uploading ≠ not done").
  async issueSubmissionUploadUrl(homeworkId: string, studentId: string, classArmId: string, dto: RequestUploadUrlDto): Promise<UploadUrlIssueResponse> {
    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findFirst({
      where: forSchool(schoolId, { id: homeworkId, classArmId, status: HomeworkStatus.PUBLISHED, deletedAt: null }),
    });
    if (!homework) {
      throw new NotFoundException("Homework not found.");
    }

    const used = await this.sumSubmissionSizes(homeworkId, studentId);
    const remaining = HOMEWORK_SUBMISSION_CAP_BYTES - used;
    if (remaining <= 0) {
      throw new ConflictException("You've already reached the 20MB upload cap for this homework.");
    }

    const storageKey = this.buildSubmissionStorageKey(schoolId, homeworkId, studentId, dto.fileName);
    const issued = await this.storageService.issueUploadUrl({ storageKey, contentType: dto.contentType, maxSizeBytes: remaining });
    return { uploadUrl: issued.uploadUrl, storageKey: issued.storageKey, expiresAt: issued.expiresAt, maxSizeBytes: remaining };
  }

  async commitSubmission(homeworkId: string, studentId: string, classArmId: string, dto: CommitFileDto): Promise<HomeworkSubmissionResponse> {
    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findFirst({
      where: forSchool(schoolId, { id: homeworkId, classArmId, status: HomeworkStatus.PUBLISHED, deletedAt: null }),
    });
    if (!homework) {
      throw new NotFoundException("Homework not found.");
    }

    if (!dto.storageKey.startsWith(this.submissionPrefix(schoolId, homeworkId, studentId))) {
      throw new BadRequestException("Invalid storage key.");
    }

    const metadata = await this.storageService.getObjectMetadata(dto.storageKey);
    if (!metadata) {
      throw new BadRequestException("No file found at this location — the upload may not have completed.");
    }

    const used = await this.sumSubmissionSizes(homeworkId, studentId);
    if (used + metadata.sizeBytes > HOMEWORK_SUBMISSION_CAP_BYTES) {
      await this.storageService.deleteObject(dto.storageKey);
      throw new ConflictException("This file would exceed your 20MB upload cap for this homework.");
    }

    const submission = await this.prisma.homeworkSubmission.create({
      data: {
        schoolId,
        homeworkId,
        studentId,
        storageKey: dto.storageKey,
        fileName: dto.fileName,
        contentType: metadata.contentType,
        sizeBytes: metadata.sizeBytes,
      },
    });
    return this.toSubmissionResponse(submission);
  }

  // v0.8.2 step 4 — folds Step 2's deferred "who marked done" together
  // with "who uploaded," one roster-based view (reuses getRoster, the
  // same cross-module import as assertTeacherAssignment). Every roster
  // student appears exactly once, whether or not they've touched this
  // homework at all — a student with no completion row and no
  // submissions still shows up with markedDone: false, submissions: [].
  async getSubmissionsForHomework(homeworkId: string, user: AuthenticatedUser): Promise<HomeworkSubmissionsView> {
    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findFirst({ where: forSchool(schoolId, { id: homeworkId, deletedAt: null }) });
    if (!homework) {
      throw new NotFoundException("Homework not found.");
    }

    const isAdminOverride = user.role === UserRole.SCHOOL_ADMIN || user.role === UserRole.PROPRIETOR;
    if (!isAdminOverride) {
      await assertTeacherAssignment(this.prisma, schoolId, user, homework.subjectId, homework.classArmId, homework.sessionId);
    }

    const roster = await getRoster(this.prisma, schoolId, homework.classArmId, homework.sessionId);
    const rosterIds = roster.map((student) => student.id);

    const [completions, submissions] = await Promise.all([
      this.prisma.homeworkCompletion.findMany({ where: { schoolId, homeworkId, studentId: { in: rosterIds } } }),
      this.prisma.homeworkSubmission.findMany({ where: { schoolId, homeworkId, studentId: { in: rosterIds } }, orderBy: { uploadedAt: "asc" } }),
    ]);
    const completionByStudentId = new Map(completions.map((completion) => [completion.studentId, completion]));
    const submissionsByStudentId = new Map<string, HomeworkSubmission[]>();
    for (const submission of submissions) {
      const list = submissionsByStudentId.get(submission.studentId) ?? [];
      list.push(submission);
      submissionsByStudentId.set(submission.studentId, list);
    }

    return {
      homeworkId,
      students: roster.map((student) => {
        const completion = completionByStudentId.get(student.id);
        return {
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`,
          markedDone: completion?.markedDone ?? false,
          markedAt: completion?.markedAt?.toISOString() ?? null,
          submissions: (submissionsByStudentId.get(student.id) ?? []).map((submission) => this.toSubmissionResponse(submission)),
        };
      }),
    };
  }

  async getSubmissionDownloadUrl(homeworkId: string, submissionId: string, user: AuthenticatedUser): Promise<DownloadUrlResult> {
    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findFirst({ where: forSchool(schoolId, { id: homeworkId, deletedAt: null }) });
    if (!homework) {
      throw new NotFoundException("Homework not found.");
    }

    const isAdminOverride = user.role === UserRole.SCHOOL_ADMIN || user.role === UserRole.PROPRIETOR;
    if (!isAdminOverride) {
      await assertTeacherAssignment(this.prisma, schoolId, user, homework.subjectId, homework.classArmId, homework.sessionId);
    }

    const submission = await this.prisma.homeworkSubmission.findFirst({ where: forSchool(schoolId, { id: submissionId, homeworkId }) });
    if (!submission) {
      throw new NotFoundException("Submission not found.");
    }

    return this.storageService.issueDownloadUrl(submission.storageKey);
  }

  // v0.8.2 step 4, flag 4 — students see/download the teacher's own
  // attachments (implied by the acceptance walk). Same own-class +
  // PUBLISHED wall as setCompletion/issueSubmissionUploadUrl.
  async getAttachmentDownloadUrlForStudent(homeworkId: string, attachmentId: string, classArmId: string): Promise<DownloadUrlResult> {
    const schoolId = this.tenantContext.schoolId;
    const homework = await this.prisma.homework.findFirst({
      where: forSchool(schoolId, { id: homeworkId, classArmId, status: HomeworkStatus.PUBLISHED, deletedAt: null }),
    });
    if (!homework) {
      throw new NotFoundException("Homework not found.");
    }

    const attachment = await this.prisma.homeworkAttachment.findFirst({ where: forSchool(schoolId, { id: attachmentId, homeworkId }) });
    if (!attachment) {
      throw new NotFoundException("Attachment not found.");
    }

    return this.storageService.issueDownloadUrl(attachment.storageKey);
  }

  // v0.8.2 step 4 (SPEC_V0.8.2.md §5 Item 10) — the actual sweep, now that
  // HomeworkAttachment/HomeworkSubmission exist (Step 3 built only the
  // deleteObject primitive). Called from SessionsService.activate() AFTER
  // its session-flip transaction commits. Includes soft-deleted homework
  // (deletedAt not filtered) — retention is about files outliving their
  // usefulness, not about active-record visibility. Homework/
  // HomeworkCompletion rows are NEVER touched here — only the two file
  // tables + their storage objects. Every deleteObject is try/caught
  // individually: a flaky Firebase call must never block session
  // activation, and the DB row is removed regardless of whether the
  // storage delete succeeded (an orphaned blob is far cheaper than a
  // blocked activation).
  async purgeSessionFiles(schoolId: string, sessionId: string): Promise<void> {
    const homeworkRows = await this.prisma.homework.findMany({ where: { schoolId, sessionId }, select: { id: true } });
    const homeworkIds = homeworkRows.map((row) => row.id);
    if (homeworkIds.length === 0) {
      return;
    }

    const [attachments, submissions] = await Promise.all([
      this.prisma.homeworkAttachment.findMany({ where: { homeworkId: { in: homeworkIds } } }),
      this.prisma.homeworkSubmission.findMany({ where: { homeworkId: { in: homeworkIds } } }),
    ]);

    for (const attachment of attachments) {
      try {
        await this.storageService.deleteObject(attachment.storageKey);
      } catch (error) {
        this.logger.warn(`Failed to delete storage object for homework attachment ${attachment.id}: ${error}`);
      }
    }
    for (const submission of submissions) {
      try {
        await this.storageService.deleteObject(submission.storageKey);
      } catch (error) {
        this.logger.warn(`Failed to delete storage object for homework submission ${submission.id}: ${error}`);
      }
    }

    await this.prisma.homeworkAttachment.deleteMany({ where: { homeworkId: { in: homeworkIds } } });
    await this.prisma.homeworkSubmission.deleteMany({ where: { homeworkId: { in: homeworkIds } } });
  }
}
