import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { GetStudentResultsQueryDto } from "../grades/dto/get-student-results-query.dto";
import { GetStudentSubjectExamsQueryDto } from "../exams/dto/get-student-subject-exams-query.dto";
import { GetYearExamsQueryDto } from "../exams/dto/get-year-exams-query.dto";
import { GetTimetableRangeDto } from "../calendar/dto/get-timetable-range.dto";
import { MarkHomeworkDoneDto } from "../homework/dto/mark-homework-done.dto";
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

  // v0.7 step 3 (SPEC_V0.7.md §4) — the per-term "Show exams" button and
  // the year-long Exams view, for a STUDENT's own record.
  @Roles(UserRole.STUDENT)
  @Get("exams")
  exams(@CurrentUser() user: AuthenticatedUser, @Query() query: GetStudentSubjectExamsQueryDto) {
    return this.meService.getMyExams(user, query);
  }

  @Roles(UserRole.STUDENT)
  @Get("year-exams")
  yearExams(@CurrentUser() user: AuthenticatedUser, @Query() query: GetYearExamsQueryDto) {
    return this.meService.getMyYearExams(user, query);
  }

  // v0.8 step 3 (SPEC_V0.8.md §7 item 3) — the student's own class's
  // resolved weekly schedule. No classArmId param anywhere on this route.
  @Roles(UserRole.STUDENT)
  @Get("timetable")
  timetable(@CurrentUser() user: AuthenticatedUser, @Query() query: GetTimetableRangeDto) {
    return this.meService.getMyTimetable(user.userId, query);
  }

  // v0.8.2 step 2 (SPEC_V0.8.2.md §6 item 2) — no classArmId/termId field
  // anywhere on this route; both resolved server-side (current
  // enrollment, current term).
  @Roles(UserRole.STUDENT)
  @Get("homework")
  homework(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getMyHomework(user.userId);
  }

  // An action on existing data, not a resource creation — 200, not the
  // POST default 201 (same convention as publish/unpublish/login/refresh
  // elsewhere in this codebase). markedDone toggles either direction
  // through this one call.
  @Roles(UserRole.STUDENT)
  @Post("homework/:id/complete")
  @HttpCode(HttpStatus.OK)
  completeHomework(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: MarkHomeworkDoneDto) {
    return this.meService.markMyHomeworkDone(user.userId, id, dto);
  }

  // v0.8 step 3 — mirrors /me/teaching's own naming convention (the
  // teacher-flavored /me/* route gets an explicit word, unlike STUDENT's
  // plain names above).
  @Roles(UserRole.TEACHER)
  @Get("teaching-timetable")
  teachingTimetable(@CurrentUser() user: AuthenticatedUser, @Query() query: GetTimetableRangeDto) {
    return this.meService.getMyTeachingTimetable(user.userId, query);
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

  @Roles(UserRole.PARENT)
  @Get("children/:childId/exams")
  childExams(
    @CurrentUser() user: AuthenticatedUser,
    @Param("childId", ParseUUIDPipe) childId: string,
    @Query() query: GetStudentSubjectExamsQueryDto,
  ) {
    return this.meService.getChildExams(user, childId, query);
  }

  @Roles(UserRole.PARENT)
  @Get("children/:childId/year-exams")
  childYearExams(
    @CurrentUser() user: AuthenticatedUser,
    @Param("childId", ParseUUIDPipe) childId: string,
    @Query() query: GetYearExamsQueryDto,
  ) {
    return this.meService.getChildYearExams(user, childId, query);
  }

  // v0.8 step 3 — assertChildBelongsToCaller (inside getChildTimetable)
  // runs before any class resolution, same ordering as every other
  // children/:childId/* route above.
  @Roles(UserRole.PARENT)
  @Get("children/:childId/timetable")
  childTimetable(
    @CurrentUser() user: AuthenticatedUser,
    @Param("childId", ParseUUIDPipe) childId: string,
    @Query() query: GetTimetableRangeDto,
  ) {
    return this.meService.getChildTimetable(user.userId, childId, query);
  }

  // v0.8.2 step 2 — PARENT is read-only here by design; there is no
  // children/:childId/homework/:id/complete route (the spec's own framing
  // is "the STUDENT sets" the tick, not a parent acting on the child's
  // behalf — Dami's ruling at plan time).
  @Roles(UserRole.PARENT)
  @Get("children/:childId/homework")
  childHomework(@CurrentUser() user: AuthenticatedUser, @Param("childId", ParseUUIDPipe) childId: string) {
    return this.meService.getChildHomework(user.userId, childId);
  }
}
