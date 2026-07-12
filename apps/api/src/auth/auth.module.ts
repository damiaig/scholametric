import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

// JwtModule is registered globally in AppModule (JwtAuthGuard, a global
// APP_GUARD, needs JwtService too), so nothing to import here.
@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
