import { Module } from "@nestjs/common";
import { GradesModule } from "../grades/grades.module";
import { ClassArmsController } from "./class-arms.controller";
import { ClassArmsService } from "./class-arms.service";

@Module({
  imports: [GradesModule],
  controllers: [ClassArmsController],
  providers: [ClassArmsService],
  exports: [ClassArmsService],
})
export class ClassArmsModule {}
