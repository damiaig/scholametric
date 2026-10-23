import { Module } from "@nestjs/common";
import { CalendarModule } from "../calendar/calendar.module";
import { StorageModule } from "../storage/storage.module";
import { LessonController } from "./lesson.controller";
import { LessonService } from "./lesson.service";

@Module({
  imports: [CalendarModule, StorageModule],
  controllers: [LessonController],
  providers: [LessonService],
  exports: [LessonService],
})
export class LessonModule {}
