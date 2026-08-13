import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { GradesService } from "../grades/grades.service";
import { GetClassArmResultsQueryDto } from "../grades/dto/get-class-arm-results-query.dto";
import { ClassArmsService } from "./class-arms.service";
import { CreateClassArmDto } from "./dto/create-class-arm.dto";
import { UpdateClassArmDto } from "./dto/update-class-arm.dto";
import { ListClassArmsQueryDto } from "./dto/list-class-arms-query.dto";
import { SetClassTeacherDto } from "./dto/set-class-teacher.dto";

@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
@Controller("class-arms")
export class ClassArmsController {
  constructor(
    private readonly classArmsService: ClassArmsService,
    private readonly gradesService: GradesService,
  ) {}

  @Get()
  findAll(@Query() query: ListClassArmsQueryDto) {
    return this.classArmsService.findAll(query.classLevelId, query.page, query.pageSize);
  }

  // View row (RBAC matrix): also readable by TEACHER, unlike the plain list
  // above (SPEC_V0.2.md §2 — this is the Classes tab's arm-detail page).
  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.classArmsService.findOne(id, query.page, query.pageSize);
  }

  // Grades overview (SPEC_V0.4.md §2/§4 step 5) — TEACHER readable too,
  // same role list as the plain :id GET above; row-filtered to the
  // caller's own subjects/overall-visibility inside GradesService.
  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get(":id/results")
  getResults(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: GetClassArmResultsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.gradesService.getClassArmResults(id, query, user);
  }

  @Audit("classArm", "create")
  @Post()
  create(@Body() dto: CreateClassArmDto) {
    return this.classArmsService.create(dto);
  }

  @Audit("classArm", "update")
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateClassArmDto) {
    return this.classArmsService.update(id, dto);
  }

  @Audit("classTeacherAssignment", "set")
  @Put(":id/class-teacher")
  setClassTeacher(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SetClassTeacherDto) {
    return this.classArmsService.setClassTeacher(id, dto.teacherUserId);
  }

  @Audit("classTeacherAssignment", "remove")
  @Delete(":id/class-teacher")
  removeClassTeacher(@Param("id", ParseUUIDPipe) id: string) {
    return this.classArmsService.removeClassTeacher(id);
  }
}
