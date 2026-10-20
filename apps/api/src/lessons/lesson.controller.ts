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
}
