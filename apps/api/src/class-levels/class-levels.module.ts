import { Module } from "@nestjs/common";
import { ClassArmsModule } from "../class-arms/class-arms.module";
import { ClassLevelsController } from "./class-levels.controller";
import { ClassLevelsService } from "./class-levels.service";

@Module({
  imports: [ClassArmsModule],
  controllers: [ClassLevelsController],
  providers: [ClassLevelsService],
})
export class ClassLevelsModule {}
