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
  ) {}

  @Get()
  findAll(@Query() query: ListStudentsQueryDto) {
    return this.studentsService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.studentsService.findOne(id);
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
