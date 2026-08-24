import { Module } from "@nestjs/common";
import { GradesModule } from "../grades/grades.module";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";

@Module({
  imports: [GradesModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
