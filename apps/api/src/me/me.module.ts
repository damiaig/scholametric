import { Module } from "@nestjs/common";
import { GradesModule } from "../grades/grades.module";
import { ExamsModule } from "../exams/exams.module";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";

@Module({
  imports: [GradesModule, ExamsModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
