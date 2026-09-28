import { Module } from "@nestjs/common";
import { CalendarModule } from "../calendar/calendar.module";
import { StorageModule } from "../storage/storage.module";
import { HomeworkController } from "./homework.controller";
import { HomeworkService } from "./homework.service";

@Module({
  imports: [CalendarModule, StorageModule],
  controllers: [HomeworkController],
  providers: [HomeworkService],
  exports: [HomeworkService],
})
export class HomeworkModule {}
