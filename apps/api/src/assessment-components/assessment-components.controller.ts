import { Body, Controller, Get, Put } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { AssessmentComponentsService } from "./assessment-components.service";
import { ReplaceAssessmentComponentsDto } from "./dto/replace-assessment-components.dto";

// PROPRIETOR/SCHOOL_ADMIN only, read and write alike (SPEC_V0.3.md §2,
// resolution 7 only extended grade-boundaries read to TEACHER, not this).
@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
@Controller("assessment-components")
export class AssessmentComponentsController {
  constructor(private readonly assessmentComponentsService: AssessmentComponentsService) {}

  @Get()
  findAll() {
    return this.assessmentComponentsService.findAll();
  }

  @Put()
  replaceAll(@Body() dto: ReplaceAssessmentComponentsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assessmentComponentsService.replaceAll(dto.components, user.userId);
  }
}
