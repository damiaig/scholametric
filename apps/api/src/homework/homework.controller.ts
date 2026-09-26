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
}
