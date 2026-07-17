import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { SubjectsService } from "./subjects.service";
import { CreateSubjectDto } from "./dto/create-subject.dto";
import { UpdateSubjectDto } from "./dto/update-subject.dto";
import { SetSubjectLevelsDto } from "./dto/set-subject-levels.dto";

// Manage: PROPRIETOR/SCHOOL_ADMIN only. View: also TEACHER (RBAC matrix
// "View teachers/classes/subjects", SPEC_V0.2.md §2) — overridden per method.
@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
@Controller("subjects")
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.subjectsService.findAll(query.page, query.pageSize);
  }

  @Audit("subject", "create")
  @Post()
  create(@Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(dto);
  }

  @Audit("subject", "update")
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSubjectDto) {
    return this.subjectsService.update(id, dto);
  }

  @Audit("subject", "delete")
  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.subjectsService.remove(id);
  }

  @Audit("subject", "setLevels")
  @Put(":id/levels")
  setLevels(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SetSubjectLevelsDto) {
    return this.subjectsService.setLevels(id, dto);
  }
}
