import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { HomeworkService } from "./homework.service";
import { CreateHomeworkDto } from "./dto/create-homework.dto";
import { UpdateHomeworkDto } from "./dto/update-homework.dto";
import { GetHomeworkQueryDto } from "./dto/get-homework-query.dto";
import { RequestUploadUrlDto } from "./dto/request-upload-url.dto";
import { CommitFileDto } from "./dto/commit-file.dto";

// v0.8.2 step 1 (SPEC_V0.8.2.md §6 item 1) — TEACHER owns create/update/
// publish entirely (mirrors GradesController's post-v0.7.4 evaluation
// narrowing); SCHOOL_ADMIN/PROPRIETOR get only the safety-valve actions
// (unpublish, delete) — no author-on-behalf-of-a-teacher path, same as
// evaluations.
@Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
@Controller("homework")
export class HomeworkController {
  constructor(private readonly homeworkService: HomeworkService) {}

  @Get()
  listHomework(@Query() query: GetHomeworkQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.listHomework(query, user);
  }

  @Audit("homework", "create")
  @Roles(UserRole.TEACHER)
  @Post()
  createHomework(@Body() dto: CreateHomeworkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.createHomework(dto, user);
  }

  @Audit("homework", "update")
  @Roles(UserRole.TEACHER)
  @Patch(":id")
  updateHomework(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateHomeworkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.updateHomework(id, dto, user);
  }

  @Post(":id/publish")
  @Roles(UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  publishHomework(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.publishHomework(id, user);
  }

  @Post(":id/unpublish")
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @HttpCode(HttpStatus.OK)
  unpublishHomework(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.unpublishHomework(id, user);
  }

  @Audit("homework", "remove")
  @Delete(":id")
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  deleteHomework(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.deleteHomework(id, user);
  }

  // v0.8.2 step 4 (SPEC_V0.8.2.md §6 item 4) — CHECKPOINT 1: issues a
  // signed upload URL capped at the remaining 20MB budget. No DB row yet.
  @Roles(UserRole.TEACHER)
  @Post(":id/attachments/upload-url")
  @HttpCode(HttpStatus.OK)
  issueAttachmentUploadUrl(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RequestUploadUrlDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.issueAttachmentUploadUrl(id, dto, user);
  }

  // CHECKPOINT 2: commits the row using the storage layer's verified
  // actual size, after validating the storage-key prefix (tenant
  // isolation — see docs/DECISIONS.md).
  @Audit("homework", "attach")
  @Roles(UserRole.TEACHER)
  @Post(":id/attachments")
  commitAttachment(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CommitFileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.commitAttachment(id, dto, user);
  }

  // v0.8.2 step 4 — folds Step 2's deferred "who marked done" together
  // with "who uploaded," one roster-based view.
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Get(":id/submissions")
  getSubmissions(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.homeworkService.getSubmissionsForHomework(id, user);
  }

  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Get(":id/submissions/:submissionId/download-url")
  getSubmissionDownloadUrl(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("submissionId", ParseUUIDPipe) submissionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeworkService.getSubmissionDownloadUrl(id, submissionId, user);
  }
}
