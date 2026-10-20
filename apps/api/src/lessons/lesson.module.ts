import { Module } from "@nestjs/common";
import { CalendarModule } from "../calendar/calendar.module";
import { LessonController } from "./lesson.controller";
import { LessonService } from "./lesson.service";

// v0.8.4 step 1 — no StorageModule yet (attachments are step 3).
@Module({
  imports: [CalendarModule],
  controllers: [LessonController],
  providers: [LessonService],
  exports: [LessonService],
})
export class LessonModule {}
