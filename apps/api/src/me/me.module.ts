import { Module } from "@nestjs/common";
import { GradesModule } from "../grades/grades.module";
import { ExamsModule } from "../exams/exams.module";
import { CalendarModule } from "../calendar/calendar.module";
import { HomeworkModule } from "../homework/homework.module";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";

@Module({
  imports: [GradesModule, ExamsModule, CalendarModule, HomeworkModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
