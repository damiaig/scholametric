import { Controller, Get, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { GetStudentResultsQueryDto } from "../grades/dto/get-student-results-query.dto";
import { MeService } from "./me.service";

// No @Roles() at the class level — every authenticated role may ask
// "what's my own teaching load"; the answer is just empty for someone with
// none. The v0.6 step 3 STUDENT routes below override with their own
// @Roles(STUDENT) — self-only reads, no id param anywhere on any of them
// (see MeService.resolveOwnStudentId's doc comment for why that's the
// actual security boundary, not just a convention).
@Controller("me")
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get("teaching")
  teaching(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.findMyTeaching(user.userId);
  }

  @Roles(UserRole.STUDENT)
  @Get("profile")
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getMyProfile(user.userId);
  }

  @Roles(UserRole.STUDENT)
  @Get("terms")
  terms(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getMyAcademicContext(user.userId);
  }

  @Roles(UserRole.STUDENT)
  @Get("report-card")
  reportCard(@CurrentUser() user: AuthenticatedUser, @Query() query: GetStudentResultsQueryDto) {
    return this.meService.getMyReportCard(user, query);
  }
}
