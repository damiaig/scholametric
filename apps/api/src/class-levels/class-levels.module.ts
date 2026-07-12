import { Module } from "@nestjs/common";
import { ClassLevelsController } from "./class-levels.controller";
import { ClassLevelsService } from "./class-levels.service";

@Module({
  controllers: [ClassLevelsController],
  providers: [ClassLevelsService],
})
export class ClassLevelsModule {}
