import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { ClassLevelsService } from "./class-levels.service";
import { CreateClassLevelDto } from "./dto/create-class-level.dto";
import { UpdateClassLevelDto } from "./dto/update-class-level.dto";

@Roles(UserRole.SCHOOL_ADMIN)
@Controller("class-levels")
export class ClassLevelsController {
  constructor(private readonly classLevelsService: ClassLevelsService) {}

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
}
