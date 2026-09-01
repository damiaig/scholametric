import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { ExamsService } from "./exams.service";
import { GetExamScoresQueryDto } from "./dto/get-exam-scores-query.dto";
import { SaveExamScoresDto } from "./dto/save-exam-scores.dto";
import { RecomputeExamGradesDto } from "./dto/recompute-exam-grades.dto";
import { PublishExamGradesDto } from "./dto/publish-exam-grades.dto";
import { UnpublishExamGradesDto } from "./dto/unpublish-exam-grades.dto";
import { GetExamsQueryDto } from "./dto/get-exams-query.dto";
import { CreateExamDto } from "./dto/create-exam.dto";
import { UpdateExamDto } from "./dto/update-exam.dto";

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

  // v0.7 step 3 (SPEC_V0.7.md §3): the authoring surface, mirroring
  // GradesController's four evaluation routes exactly — same role list
  // (inherited from the controller-level @Roles() above) for list/create/
  // update, PROPRIETOR-only override for delete.
  @Get()
  listExams(@Query() query: GetExamsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examsService.listExams(query, user);
  }

  @Audit("exam", "create")
  @Post()
  createExam(@Body() dto: CreateExamDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examsService.createExam(dto, user);
  }

  @Audit("exam", "update")
  @Patch(":id")
  updateExam(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateExamDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examsService.updateExam(id, dto, user);
  }

  // Owner-only, categorical (mirrors DELETE /grades/evaluations/:id) —
  // no force-delete-through-published path; ExamsService 409s outright
  // while this subject's exam results are published.
  @Audit("exam", "remove")
  @Roles(UserRole.PROPRIETOR)
  @Delete(":id")
  deleteExam(@Param("id", ParseUUIDPipe) id: string) {
    return this.examsService.deleteExam(id);
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
