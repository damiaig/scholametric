import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { PersonnelService } from "./personnel.service";
import { CreatePersonnelDto } from "./dto/create-personnel.dto";
import { UpdatePersonnelDto } from "./dto/update-personnel.dto";
import { ListPersonnelQueryDto } from "./dto/list-personnel-query.dto";

// Supersedes v0.1's /users (SPEC_V0.2.md §2). No TEACHER row in the RBAC
// matrix for personnel management — PROPRIETOR/SCHOOL_ADMIN only, including reads.
@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
@Controller("personnel")
export class PersonnelController {
  constructor(private readonly personnelService: PersonnelService) {}

  @Get()
  findAll(@Query() query: ListPersonnelQueryDto) {
    return this.personnelService.findAll(query);
  }

  @Audit("personnel", "create")
  @Post()
  create(@Body() dto: CreatePersonnelDto) {
    return this.personnelService.create(dto);
  }

  @Audit("personnel", "update")
  @Patch(":userId")
  update(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: UpdatePersonnelDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.personnelService.update(userId, dto, currentUser.userId);
  }

  @Audit("personnel", "resetPassword")
  @Post(":userId/reset-password")
  @HttpCode(HttpStatus.OK)
  resetPassword(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.personnelService.resetPassword(userId);
  }
}
