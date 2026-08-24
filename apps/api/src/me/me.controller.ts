import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { GetStudentResultsQueryDto } from "../grades/dto/get-student-results-query.dto";
import { MeService } from "./me.service";

// No @Roles() at the class level — every authenticated role may ask
// "what's my own teaching load"; the answer is just empty for someone with
// none. The v0.6 step 3 STUDENT routes and step 4 PARENT routes below each
// override with exactly one role — @Roles(STUDENT, PARENT) is deliberately
// NOT used on the param-less /me/report-card: that route resolves "self"
// as one student via user.studentId, which only means something for
// STUDENT; a PARENT (who may have several children) reaches their
// children exclusively through the /me/children* routes below, which take
// a childId and validate it against their own linked set (see
// MeService.assertChildBelongsToCaller's doc comment) before any grade
// query — not a param-less "self" read.
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

  // v0.6 step 4 (SPEC_V0.6.md §2.4) — the child-switcher's data.
  @Roles(UserRole.PARENT)
  @Get("children")
  children(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getMyChildren(user.userId);
  }

  @Roles(UserRole.PARENT)
  @Get("children/:childId/profile")
  childProfile(@CurrentUser() user: AuthenticatedUser, @Param("childId", ParseUUIDPipe) childId: string) {
    return this.meService.getChildProfile(user.userId, childId);
  }

  @Roles(UserRole.PARENT)
  @Get("children/:childId/terms")
  childTerms(@CurrentUser() user: AuthenticatedUser, @Param("childId", ParseUUIDPipe) childId: string) {
    return this.meService.getChildTerms(user.userId, childId);
  }

  @Roles(UserRole.PARENT)
  @Get("children/:childId/report-card")
  childReportCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param("childId", ParseUUIDPipe) childId: string,
    @Query() query: GetStudentResultsQueryDto,
  ) {
    return this.meService.getChildReportCard(user, childId, query);
  }
}
