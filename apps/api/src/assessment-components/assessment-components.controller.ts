import { Body, Controller, Get, Put } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { AssessmentComponentsService } from "./assessment-components.service";
import { ReplaceAssessmentComponentsDto } from "./dto/replace-assessment-components.dto";

// PROPRIETOR/SCHOOL_ADMIN write; read is additionally open to TEACHER
// (v0.4 step 4) — the score-entry grid's component picker needs the
// active component list (name/max_score/requires_approval), and nothing
// else exposes it. Matches the exact precedent already set for grade-
// boundaries' GET (SPEC_V0.3.md §2 resolution 7) — this just extends the
// same read-only carve-out to assessment-components.
@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
@Controller("assessment-components")
export class AssessmentComponentsController {
  constructor(private readonly assessmentComponentsService: AssessmentComponentsService) {}

  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get()
  findAll() {
    return this.assessmentComponentsService.findAll();
  }

  @Put()
  replaceAll(@Body() dto: ReplaceAssessmentComponentsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assessmentComponentsService.replaceAll(dto.components, user.userId);
  }
}
