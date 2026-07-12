import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { SchoolsService, SchoolSearchResult } from "./schools.service";
import { SearchSchoolsDto } from "./dto/search-schools.dto";
import { CreateSchoolDto } from "./dto/create-school.dto";
import { UpdateSchoolDto } from "./dto/update-school.dto";

// @Roles() is applied per-method here (not at the class), because /schools/search
// below must stay public and roles-free — a class-level @Roles() would still
// apply to it (RolesGuard falls back to class metadata) and lock it down.
@Controller("schools")
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get("search")
  search(@Query() query: SearchSchoolsDto): Promise<SchoolSearchResult[]> {
    return this.schoolsService.search(query.q);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateSchoolDto) {
    return this.schoolsService.create(dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.schoolsService.findAll(query.page, query.pageSize);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.schoolsService.findOne(id);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSchoolDto) {
    return this.schoolsService.update(id, dto);
  }
}
