import { Body, Controller, Get, Put } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { GradeBoundariesService } from "./grade-boundaries.service";
import { ReplaceGradeBoundariesDto } from "./dto/replace-grade-boundaries.dto";

@Controller("grade-boundaries")
export class GradeBoundariesController {
  constructor(private readonly gradeBoundariesService: GradeBoundariesService) {}

  // Resolution 7: TEACHER can read (they'll need this reference once score
  // entry lands in v0.4) — write stays admin-only below.
  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get()
  findAll() {
    return this.gradeBoundariesService.findAll();
  }

  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
  @Put()
  replaceAll(@Body() dto: ReplaceGradeBoundariesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradeBoundariesService.replaceAll(dto.boundaries, user.userId);
  }
}
