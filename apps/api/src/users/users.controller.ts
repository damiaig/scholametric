import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { UsersService } from "./users.service";
import { PersonnelService } from "../personnel/personnel.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";

// Superseded by /personnel (SPEC_V0.2.md §2) — kept working, unchanged,
// since nothing in the spec asks to remove it and PROPRIETOR isn't added
// to its class-level @Roles(): a PROPRIETOR hitting POST/PATCH here would
// create/edit SCHOOL_ADMIN/TEACHER users with no staff_profile, silently
// breaking this version's "every such user has one" invariant. Only
// reset-password is explicitly "moved... kept as alias" — it has no such
// risk, so it delegates to PersonnelService and accepts PROPRIETOR too.
@Roles(UserRole.SCHOOL_ADMIN)
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly personnelService: PersonnelService,
  ) {}

  /** @deprecated superseded by GET /personnel (SPEC_V0.2.md §2); unchanged, planned removal in v0.3. */
  @Get()
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  /** @deprecated superseded by POST /personnel (SPEC_V0.2.md §2); unchanged, planned removal in v0.3. */
  @Audit("user", "create")
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  /** @deprecated superseded by PATCH /personnel/:userId (SPEC_V0.2.md §2); unchanged, planned removal in v0.3. */
  @Audit("user", "update")
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, currentUser.userId);
  }

  /** @deprecated moved to POST /personnel/:userId/reset-password (SPEC_V0.2.md §2); kept as an alias for one version. */
  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
  @Audit("user", "resetPassword")
  @Post(":id/reset-password")
  @HttpCode(HttpStatus.OK)
  resetPassword(@Param("id", ParseUUIDPipe) id: string) {
    return this.personnelService.resetPassword(id);
  }
}
