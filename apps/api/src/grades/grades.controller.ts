import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { GradesService } from "./grades.service";
import { GetEvaluationScoresQueryDto } from "./dto/get-evaluation-scores-query.dto";
import { SaveEvaluationScoresDto } from "./dto/save-evaluation-scores.dto";
import { RecomputeGradesDto } from "./dto/recompute-grades.dto";
import { OverrideGradeDto } from "./dto/override-grade.dto";
import { GetGradesReviewQueryDto } from "./dto/get-grades-review-query.dto";
import { GetEvaluationsQueryDto } from "./dto/get-evaluations-query.dto";
import { CreateEvaluationDto } from "./dto/create-evaluation.dto";
import { UpdateEvaluationDto } from "./dto/update-evaluation.dto";

// TEACHER: only their own assigned subject+arm, and only for score entry
// (enforced inside GradesService, not here — fine-grained authorization
// lives in the service layer throughout this codebase; RolesGuard only
// ever does coarse role-list gating). SCHOOL_ADMIN/PROPRIETOR: any class
// in their school for entry, review, and publish. Owner-only actions
// (unpublish, override-on-published) narrow further via a per-route
// @Roles() override below. SUPER_ADMIN is deliberately absent everywhere
// — no school academic data access (SPEC_V0.4.md §2).
@Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
@Controller("grades")
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  // v0.7 step 1: replaces /grades/grid (componentId-keyed) — evaluations
  // replace the fixed CA1/CA2/Exam structure entirely (SPEC_V0.7.md §2).
  @Get("evaluation-scores")
  getEvaluationScores(@Query() query: GetEvaluationScoresQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.getEvaluationScores(query, user);
  }

  @Put("evaluation-scores")
  saveEvaluationScores(@Body() dto: SaveEvaluationScoresDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.saveEvaluationScores(dto, user);
  }

  // v0.7 step 2 (SPEC_V0.7.md §3): the authoring surface. TEACHER/
  // SCHOOL_ADMIN/PROPRIETOR all inherit the controller-level @Roles()
  // above — same role list as scoring, confirmed. Fine-grained
  // authorization (assignment check, draft-vs-published edit gating) lives
  // in GradesService, same discipline as every other route here.
  @Get("evaluations")
  listEvaluations(@Query() query: GetEvaluationsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.listEvaluations(query, user);
  }

  @Audit("evaluation", "create")
  @Post("evaluations")
  createEvaluation(@Body() dto: CreateEvaluationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.createEvaluation(dto, user);
  }

  @Audit("evaluation", "update")
  @Patch("evaluations/:id")
  updateEvaluation(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateEvaluationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.updateEvaluation(id, dto, user);
  }

  // Owner-only, categorical (mirrors unpublish() above) — confirmed no
  // force-delete-through-published path; GradesService 409s outright
  // while this subject's results are published.
  @Audit("evaluation", "remove")
  @Roles(UserRole.PROPRIETOR)
  @Delete("evaluations/:id")
  deleteEvaluation(@Param("id", ParseUUIDPipe) id: string) {
    return this.gradesService.deleteEvaluation(id);
  }

  // Admin-only manual re-trigger (SPEC_V0.4.md §2) — overrides the class-
  // level @Roles() above, so TEACHER cannot reach it. An action on
  // existing data, not a resource creation — 200, not the POST default
  // 201 (same convention as .../withdraw, .../transfer-class, auth's
  // login/refresh/logout/change-password).
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Post("recompute")
  @HttpCode(HttpStatus.OK)
  recompute(@Body() dto: RecomputeGradesDto) {
    return this.gradesService.recompute(dto);
  }

  // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — replaces POST /grades/publish.
  // Publish moved from the subject to the individual evaluation; the
  // route param carries the evaluation id (it already knows its own
  // classArmId/subjectId/termId), no request body needed. Role shape
  // carried over unchanged from v0.7.3: director-or-owner, or a TEACHER
  // publishing an evaluation of a subject they're assigned to (fine-
  // grained scoping lives in GradesService.publishEvaluation() itself,
  // same discipline as every other route here).
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Post("evaluations/:id/publish")
  @HttpCode(HttpStatus.OK)
  publishEvaluation(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.publishEvaluation(id, user);
  }

  // v0.7.4 step 1 — replaces POST /grades/unpublish. Owner, or a TEACHER
  // unpublishing their OWN assigned subject's evaluation — SCHOOL_ADMIN
  // still excluded here, unchanged asymmetry with publish carried over
  // from v0.7.3.
  @Roles(UserRole.TEACHER, UserRole.PROPRIETOR)
  @Post("evaluations/:id/unpublish")
  @HttpCode(HttpStatus.OK)
  unpublishEvaluation(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.unpublishEvaluation(id, user);
  }

  // Both roles may reach this route; the PUBLISHED-result PROPRIETOR-only
  // restriction and the DRAFT block are data-dependent, enforced inside
  // GradesService (see its override() doc comment).
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Put("override")
  override(@Body() dto: OverrideGradeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.override(dto, user);
  }

  // Director/owner publish-readiness view (SPEC_V0.4.md §2 step 5) — no
  // TEACHER path at all, unlike every other route on this controller.
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Get("review")
  getReview(@Query() query: GetGradesReviewQueryDto) {
    return this.gradesService.getReview(query);
  }
}
