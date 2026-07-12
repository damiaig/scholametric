import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "./config/env.validation";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { SchoolsModule } from "./schools/schools.module";
import { SessionsModule } from "./sessions/sessions.module";
import { TermsModule } from "./terms/terms.module";
import { ClassLevelsModule } from "./class-levels/class-levels.module";
import { ClassArmsModule } from "./class-arms/class-arms.module";
import { TenantModule } from "./common/tenant/tenant.module";
import { AppThrottlerGuard } from "./common/guards/app-throttler.guard";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // No default secret here: AuthService/JwtAuthGuard pass JWT_ACCESS_SECRET
    // or JWT_REFRESH_SECRET explicitly per call (see docs/DECISIONS.md).
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ name: "default", ttl: 60000, limit: 100 }]),
    PrismaModule,
    TenantModule,
    HealthModule,
    AuthModule,
    SchoolsModule,
    SessionsModule,
    TermsModule,
    ClassLevelsModule,
    ClassArmsModule,
  ],
  providers: [
    // Order matters — Nest runs global APP_GUARDs in registration order:
    // JwtAuthGuard first (populates request.user, or short-circuits @Public()
    // routes with no DB/network cost), then AppThrottlerGuard (its tracker
    // needs request.user to throttle per-user rather than per-IP), then
    // RolesGuard (also reads request.user).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
