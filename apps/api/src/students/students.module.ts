import { Module } from "@nestjs/common";
import { GradesModule } from "../grades/grades.module";
import { ExamsModule } from "../exams/exams.module";
import { StudentsController } from "./students.controller";
import { StudentsService } from "./students.service";
import { StudentGuardiansService } from "./student-guardians.service";

@Module({
  imports: [GradesModule, ExamsModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentGuardiansService],
})
export class StudentsModule {}
