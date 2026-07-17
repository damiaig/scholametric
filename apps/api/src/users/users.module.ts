import { Module } from "@nestjs/common";
import { PersonnelModule } from "../personnel/personnel.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [PersonnelModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
