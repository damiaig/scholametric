import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { LessonService } from "./lesson.service";
import { CreateLessonDto } from "./dto/create-lesson.dto";
import { UpdateLessonDto } from "./dto/update-lesson.dto";
import { GetLessonsQueryDto } from "./dto/get-lessons-query.dto";
import { RequestUploadUrlDto } from "./dto/request-upload-url.dto";
import { CommitFileDto } from "./dto/commit-file.dto";

// v0.8.4 step 1 (SPEC_V0.8.4.md §4.1) — TEACHER owns create/update/
// publish entirely (mirrors HomeworkController's own narrowing);
// SCHOOL_ADMIN/PROPRIETOR get only the safety-valve actions (unpublish,
// delete) — no author-on-behalf-of-a-teacher path.
@Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
@Controller("lessons")
export class LessonController {
  constructor(private readonly lessonService: LessonService) {}

  @Get()
  listLessons(@Query() query: GetLessonsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonService.listLessons(query, user);
  }

  // v0.8.4 step 2 (SPEC_V0.8.4.md §6 step 2) — the lessonDate picker's
  // data source. TEACHER-only, matching createLesson's own @Roles
  // restriction — only a teacher ever opens the create form. Reuses
  // GetLessonsQueryDto directly (classArmId+subjectId, no termId — this
  // model has none) rather than a redundant near-duplicate DTO.
  @Roles(UserRole.TEACHER)
  @Get("teaching-weekdays")
  getTeachingWeekdays(@Query() query: GetLessonsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonService.getTeachingWeekdays(query.classArmId, query.subjectId, user);
  }

  @Audit("lesson", "create")
  @Roles(UserRole.TEACHER)
  @Post()
  createLesson(@Body() dto: CreateLessonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonService.createLesson(dto, user);
  }

  @Audit("lesson", "update")
  @Roles(UserRole.TEACHER)
  @Patch(":id")
  updateLesson(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateLessonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonService.updateLesson(id, dto, user);
  }

  @Post(":id/publish")
  @Roles(UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  publishLesson(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonService.publishLesson(id, user);
  }

  @Post(":id/unpublish")
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @HttpCode(HttpStatus.OK)
  unpublishLesson(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonService.unpublishLesson(id, user);
  }

  @Audit("lesson", "remove")
  @Delete(":id")
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  deleteLesson(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonService.deleteLesson(id, user);
  }

  // v0.8.4 step 3 (SPEC_V0.8.4.md §5) — CHECKPOINT 1: issues a signed
  // upload URL capped at the remaining 20MB budget. No DB row yet.
  // TEACHER-only — attaching is authoring, not a safety-valve action.
  @Roles(UserRole.TEACHER)
  @Post(":id/attachments/upload-url")
  @HttpCode(HttpStatus.OK)
  issueAttachmentUploadUrl(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RequestUploadUrlDto, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonService.issueAttachmentUploadUrl(id, dto, user);
  }

  // CHECKPOINT 2: commits the row using the storage layer's verified
  // actual size, after validating the storage-key prefix (tenant
  // isolation).
  @Audit("lesson", "attach")
  @Roles(UserRole.TEACHER)
  @Post(":id/attachments")
  commitAttachment(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CommitFileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonService.commitAttachment(id, dto, user);
  }

  // Same authorization shape as deleteLesson: TEACHER gated by
  // assertTeacherAssignment inside the service, SCHOOL_ADMIN/PROPRIETOR
  // allowed outright (the safety-valve family).
  @Audit("lesson", "detach")
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Delete(":id/attachments/:attachmentId")
  deleteAttachment(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("attachmentId", ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonService.deleteAttachment(id, attachmentId, user);
  }

  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Get(":id/attachments/:attachmentId/download-url")
  getAttachmentDownloadUrl(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("attachmentId", ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonService.getAttachmentDownloadUrlForTeacher(id, attachmentId, user);
  }
}
