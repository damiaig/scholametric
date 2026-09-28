import { Module } from "@nestjs/common";
import { HomeworkModule } from "../homework/homework.module";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

@Module({
  imports: [HomeworkModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
