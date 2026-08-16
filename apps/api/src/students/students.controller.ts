import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { GradesService } from "../grades/grades.service";
import { GetStudentResultsQueryDto } from "../grades/dto/get-student-results-query.dto";
import { WriteRemarkDto } from "../grades/dto/write-remark.dto";
import { StudentsService } from "./students.service";
import { StudentGuardiansService } from "./student-guardians.service";
import { CreateStudentDto } from "./dto/create-student.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";
import { WithdrawStudentDto } from "./dto/withdraw-student.dto";
import { TransferClassDto } from "./dto/transfer-class.dto";
import { ListStudentsQueryDto } from "./dto/list-students-query.dto";
import { AddStudentGuardianDto } from "./dto/add-student-guardian.dto";

// PROPRIETOR/SCHOOL_ADMIN get full access; TEACHER is read-only (overridden
// per mutation below); SUPER_ADMIN is deliberately absent from every
// @Roles() here — no school student data is reachable, 403 not 404
// (docs/DECISIONS.md).
@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
@Controller("students")
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly studentGuardiansService: StudentGuardiansService,
    private readonly gradesService: GradesService,
  ) {}

  @Get()
  findAll(@Query() query: ListStudentsQueryDto) {
    return this.studentsService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.studentsService.findOne(id);
  }

  // Results tab (SPEC_V0.4.md §2/§4 step 5). TEACHER access is a plain
  // allow/deny inside GradesService (any relationship to the student's
  // class arm — deliberately looser than the class-arm overview's
  // per-subject filter, see getStudentResults()'s doc comment) — NOT the
  // same as findOne() above, which has no teacher-scoping at all
  // (unchanged, out of scope for this step).
  @Get(":id/results")
  getResults(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: GetStudentResultsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.gradesService.getStudentResults(id, query, user);
  }

  // Printable per-student term report card (SPEC_V0.5.md §2.4, v0.5 step
  // 4) — a NEW, dedicated endpoint, not an extension of getResults() above
  // (see GradesService.getReportCard()'s doc comment for why). Same TEACHER
  // read rule as the Results tab (any relationship to the class arm) —
  // stricter access is enforced on the remark WRITE routes below, not here.
  @Get(":id/report-card")
  getReportCard(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: GetStudentResultsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.gradesService.getReportCard(id, query, user);
  }

  // Class-teacher-only for TEACHER (enforced inside GradesService, since it
  // depends on class-teacher-vs-subject-teacher data, not a fixed role) —
  // SCHOOL_ADMIN/PROPRIETOR reach this route too, per the class-level
  // @Roles() above, with no extra check.
  @Audit("termRemark", "writeTeacherRemark")
  @Put(":id/remarks/teacher")
  writeTeacherRemark(@Param("id", ParseUUIDPipe) id: string, @Body() dto: WriteRemarkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.writeTeacherRemark(id, dto, user);
  }

  // SCHOOL_ADMIN/PROPRIETOR only — overrides the class-level @Roles() above
  // so TEACHER never reaches the handler at all (categorical 403, same "no
  // TEACHER path" pattern as GET /grades/review).
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
  @Audit("termRemark", "writePrincipalRemark")
  @Put(":id/remarks/principal")
  writePrincipalRemark(@Param("id", ParseUUIDPipe) id: string, @Body() dto: WriteRemarkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.gradesService.writePrincipalRemark(id, dto, user);
  }

  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
  @Audit("student", "create")
  @Post()
  create(@Body() dto: CreateStudentDto) {
    return this.studentsService.create(dto);
  }

  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
  @Audit("student", "update")
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.update(id, dto);
  }

  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
  @Audit("student", "withdraw")
  @Post(":id/withdraw")
  @HttpCode(HttpStatus.OK)
  withdraw(@Param("id", ParseUUIDPipe) id: string, @Body() dto: WithdrawStudentDto) {
    return this.studentsService.withdraw(id, dto);
  }

  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
  @Audit("student", "transferClass")
  @Post(":id/transfer-class")
  @HttpCode(HttpStatus.OK)
  transferClass(@Param("id", ParseUUIDPipe) id: string, @Body() dto: TransferClassDto) {
    return this.studentsService.transferClass(id, dto);
  }

  @Get(":id/guardians")
  findGuardians(@Param("id", ParseUUIDPipe) id: string) {
    return this.studentGuardiansService.findAll(id);
  }

  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
  @Audit("studentGuardian", "add")
  @Post(":id/guardians")
  addGuardian(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AddStudentGuardianDto) {
    return this.studentGuardiansService.add(id, dto);
  }

  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
  @Audit("studentGuardian", "remove")
  @Delete(":id/guardians/:guardianId")
  removeGuardian(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("guardianId", ParseUUIDPipe) guardianId: string,
    @Query("force", new DefaultValuePipe(false), ParseBoolPipe) force: boolean,
  ) {
    return this.studentGuardiansService.remove(id, guardianId, force);
  }

  @Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
  @Audit("studentGuardian", "setPrimary")
  @Put(":id/guardians/:guardianId/primary")
  setPrimaryGuardian(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("guardianId", ParseUUIDPipe) guardianId: string,
  ) {
    return this.studentGuardiansService.setPrimary(id, guardianId);
  }
}
