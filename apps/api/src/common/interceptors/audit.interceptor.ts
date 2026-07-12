import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { concatMap } from "rxjs/operators";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_KEY, AuditMetadata } from "../decorators/audit.decorator";
import type { AuthenticatedUser } from "../types/authenticated-user";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Global (see AppModule) but a no-op unless the route carries @Audit().
 * Awaits the audit_logs write before the response is emitted — by the time
 * a client sees the 200/201, the row already exists (no fire-and-forget
 * race for callers/tests asserting on it).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMetadata | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      return next.handle();
    }

    return next.handle().pipe(
      concatMap(async (response: unknown) => {
        const entityId = (response as { id?: string } | undefined)?.id;
        if (entityId) {
          await this.prisma.auditLog.create({
            data: {
              schoolId: user.schoolId,
              actorUserId: user.userId,
              action: `${meta.entityType}.${meta.action}`,
              entityType: meta.entityType,
              entityId,
              metadata: request.body ?? undefined,
            },
          });
        }
        return response;
      }),
    );
  }
}
