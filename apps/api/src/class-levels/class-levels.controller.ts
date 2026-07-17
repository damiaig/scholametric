import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { ClassArmsService } from "../class-arms/class-arms.service";
import { ClassLevelsService } from "./class-levels.service";
import { CreateClassLevelDto } from "./dto/create-class-level.dto";
import { UpdateClassLevelDto } from "./dto/update-class-level.dto";
import { AddClassArmDto } from "./dto/add-class-arm.dto";

@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
@Controller("class-levels")
export class ClassLevelsController {
  constructor(
    private readonly classLevelsService: ClassLevelsService,
    private readonly classArmsService: ClassArmsService,
  ) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.classLevelsService.findAll(query.page, query.pageSize);
  }

  @Audit("classLevel", "create")
  @Post()
  create(@Body() dto: CreateClassLevelDto) {
    return this.classLevelsService.create(dto);
  }

  @Audit("classLevel", "update")
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateClassLevelDto) {
    return this.classLevelsService.update(id, dto);
  }

  // The natural "add arm B to JSS 1" flow — wraps the existing class-arms
  // create (SPEC_V0.2.md §2), classLevelId comes from the path, not the body.
  @Audit("classArm", "create")
  @Post(":id/arms")
  addArm(@Param("id", ParseUUIDPipe) classLevelId: string, @Body() dto: AddClassArmDto) {
    return this.classArmsService.create({ name: dto.name, classLevelId });
  }
}
