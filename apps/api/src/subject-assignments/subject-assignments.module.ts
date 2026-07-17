import { Module } from "@nestjs/common";
import { SubjectAssignmentsController } from "./subject-assignments.controller";
import { SubjectAssignmentsService } from "./subject-assignments.service";

@Module({
  controllers: [SubjectAssignmentsController],
  providers: [SubjectAssignmentsService],
})
export class SubjectAssignmentsModule {}
