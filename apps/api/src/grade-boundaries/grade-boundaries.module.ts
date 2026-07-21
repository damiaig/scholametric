import { Module } from "@nestjs/common";
import { GradeBoundariesController } from "./grade-boundaries.controller";
import { GradingPresetsController } from "./grading-presets.controller";
import { GradeBoundariesService } from "./grade-boundaries.service";

@Module({
  controllers: [GradeBoundariesController, GradingPresetsController],
  providers: [GradeBoundariesService],
})
export class GradeBoundariesModule {}
