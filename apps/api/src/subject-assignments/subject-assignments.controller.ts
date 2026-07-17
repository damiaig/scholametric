import { Body, Controller, Delete, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { SubjectAssignmentsService } from "./subject-assignments.service";
import { CreateSubjectAssignmentDto } from "./dto/create-subject-assignment.dto";

@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
@Controller("subject-assignments")
export class SubjectAssignmentsController {
  constructor(private readonly subjectAssignmentsService: SubjectAssignmentsService) {}

  @Audit("subjectTeacherAssignment", "create")
  @Post()
  create(@Body() dto: CreateSubjectAssignmentDto) {
    return this.subjectAssignmentsService.create(dto);
  }

  @Audit("subjectTeacherAssignment", "remove")
  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.subjectAssignmentsService.remove(id);
  }
}
