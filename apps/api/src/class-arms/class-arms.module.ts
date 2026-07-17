import { Module } from "@nestjs/common";
import { ClassArmsController } from "./class-arms.controller";
import { ClassArmsService } from "./class-arms.service";

@Module({
  controllers: [ClassArmsController],
  providers: [ClassArmsService],
  exports: [ClassArmsService],
})
export class ClassArmsModule {}
