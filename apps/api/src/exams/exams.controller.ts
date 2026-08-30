import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { ExamsService } from "./exams.service";
import { GetExamScoresQueryDto } from "./dto/get-exam-scores-query.dto";
import { SaveExamScoresDto } from "./dto/save-exam-scores.dto";
import { RecomputeExamGradesDto } from "./dto/recompute-exam-grades.dto";
import { PublishExamGradesDto } from "./dto/publish-exam-grades.dto";
import { UnpublishExamGradesDto } from "./dto/unpublish-exam-grades.dto";

// Mirrors GradesController's role split exactly (SPEC_V0.7.md §2, "same
// publish model as v0.4" applied to the exam track): TEACHER for score
// entry only, SCHOOL_ADMIN/PROPRIETOR for recompute/publish, PROPRIETOR
// only for unpublish. SUPER_ADMIN deliberately absent.
@Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
@Controller("exams")
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Get("scores")
  getExamScores(@Query() query: GetExamScoresQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examsService.getExamScores(query, user);
  }

  @Put("scores")
  saveExamScores(@Body() dto: SaveExamScoresDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examsService.saveExamScores(dto, user);
  }

  @Roles(UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Post("recompute")
  @HttpCode(HttpStatus.OK)
  recompute(@Body() dto: RecomputeExamGradesDto) {
    return this.examsService.recompute(dto);
  }

  @Roles(UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Post("publish")
  @HttpCode(HttpStatus.OK)
  publish(@Body() dto: PublishExamGradesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examsService.publish(dto, user);
  }

  @Roles(UserRole.PROPRIETOR)
  @Post("unpublish")
  @HttpCode(HttpStatus.OK)
  unpublish(@Body() dto: UnpublishExamGradesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examsService.unpublish(dto, user);
  }
}
