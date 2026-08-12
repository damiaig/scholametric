import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { GradesService } from "./grades.service";
import { GetGradesGridQueryDto } from "./dto/get-grades-grid-query.dto";
import { SaveGradesGridDto } from "./dto/save-grades-grid.dto";
import { RecomputeGradesDto } from "./dto/recompute-grades.dto";
import { PublishGradesDto } from "./dto/publish-grades.dto";
import { UnpublishGradesDto } from "./dto/unpublish-grades.dto";
import { OverrideGradeDto } from "./dto/override-grade.dto";

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

  @Get("grid")
  getGrid(@Query() query: GetGradesGridQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.getGrid(query, user);
  }

  @Put("grid")
  saveGrid(@Body() dto: SaveGradesGridDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.saveGrid(dto, user);
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

  // Director-or-owner: SCHOOL_ADMIN and PROPRIETOR may both publish.
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Post("publish")
  @HttpCode(HttpStatus.OK)
  publish(@Body() dto: PublishGradesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.publish(dto, user);
  }

  // Owner-only: unpublishing is PROPRIETOR-only, unlike publish.
  @Roles(UserRole.PROPRIETOR)
  @Post("unpublish")
  @HttpCode(HttpStatus.OK)
  unpublish(@Body() dto: UnpublishGradesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.unpublish(dto, user);
  }

  // Both roles may reach this route; the PUBLISHED-result PROPRIETOR-only
  // restriction and the DRAFT block are data-dependent, enforced inside
  // GradesService (see its override() doc comment).
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Put("override")
  override(@Body() dto: OverrideGradeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.override(dto, user);
  }
}
