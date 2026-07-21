import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
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
import { StudentsModule } from "./students/students.module";
import { GuardiansModule } from "./guardians/guardians.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { PersonnelModule } from "./personnel/personnel.module";
import { TeachersModule } from "./teachers/teachers.module";
import { SubjectAssignmentsModule } from "./subject-assignments/subject-assignments.module";
import { SubjectsModule } from "./subjects/subjects.module";
import { ClassesModule } from "./classes/classes.module";
import { AuditLogsModule } from "./audit-logs/audit-logs.module";
import { TenantModule } from "./common/tenant/tenant.module";
import { AppThrottlerGuard } from "./common/guards/app-throttler.guard";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";

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
    StudentsModule,
    GuardiansModule,
    DashboardModule,
    PersonnelModule,
    TeachersModule,
    SubjectAssignmentsModule,
    SubjectsModule,
    ClassesModule,
    AuditLogsModule,
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
    // Global but a no-op without @Audit() — see AuditInterceptor.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
