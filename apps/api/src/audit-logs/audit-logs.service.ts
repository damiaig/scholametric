import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate, Paginated } from "../common/pagination/paginate";

export interface ListAuditLogsParams {
  entityType?: string;
  entityId?: string;
  page: number;
  pageSize: number;
}

export interface AuditLogSummary {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: Date;
  actor: { id: string; firstName: string; lastName: string };
}

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(query: ListAuditLogsParams): Promise<Paginated<AuditLogSummary>> {
    const schoolId = this.tenantContext.schoolId;
    const where = forSchool(schoolId, {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    });

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(
      items.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: log.metadata,
        createdAt: log.createdAt,
        actor: { id: log.actor.id, firstName: log.actor.firstName, lastName: log.actor.lastName },
      })),
      total,
      query.page,
      query.pageSize,
    );
  }
}
