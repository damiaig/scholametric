import { Module } from "@nestjs/common";
import { HomeworkModule } from "../homework/homework.module";
import { LessonModule } from "../lessons/lesson.module";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

@Module({
  imports: [HomeworkModule, LessonModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
