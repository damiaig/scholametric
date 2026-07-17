import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
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

  // SUPER_ADMIN may PATCH any school. PROPRIETOR/SCHOOL_ADMIN may only PATCH
  // their OWN school (id must equal their JWT schoolId, else 404) and only
  // name/address/phone/email — SchoolsService.update 400s if a school-level
  // caller sends type/status (SPEC_V0.2.md §2's RBAC resolution). `slug`
  // needs no special handling: it's not in UpdateSchoolDto at all, so the
  // global ValidationPipe's forbidNonWhitelisted already 400s it for anyone.
  // Still no @Audit() here even for the school-level path: the interceptor
  // always logs under request.user.schoolId, which is correct when a school
  // user patches their own school but wrong when SUPER_ADMIN patches some
  // OTHER school (same reason the whole controller was excluded originally
  // — see docs/DECISIONS.md) — the interceptor can't tell the two apart.
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSchoolDto, @CurrentUser() user: AuthenticatedUser) {
    return this.schoolsService.update(id, dto, user);
  }
}
