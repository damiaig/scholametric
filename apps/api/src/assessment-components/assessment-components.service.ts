import { BadRequestException, Injectable } from "@nestjs/common";
import type { AssessmentComponent } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { AssessmentComponentItemDto } from "./dto/assessment-component-item.dto";

@Injectable()
export class AssessmentComponentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(): Promise<AssessmentComponent[]> {
    const schoolId = this.tenantContext.schoolId;
    return this.prisma.assessmentComponent.findMany({
      where: forSchool(schoolId),
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }

  // Full-set atomic replace (SPEC_V0.3.md §2): validated as a whole set
  // (count, sum, uniqueness — none of which a single-item decorator can
  // express) then hard-deleted and recreated in one transaction, so a
  // rejected PUT never touches the persisted set (all-or-nothing) and a
  // successful one never leaves an intermediate non-100 state visible to
  // any concurrent reader. deleted_at is reserved/unwired in v0.3
  // (resolution 8, docs/DECISIONS.md) — this is a real hard delete.
  async replaceAll(items: AssessmentComponentItemDto[], actorUserId: string): Promise<AssessmentComponent[]> {
    const schoolId = this.tenantContext.schoolId;
    this.validate(items);

    return this.prisma.$transaction(async (tx) => {
      await tx.assessmentComponent.deleteMany({ where: { schoolId } });
      const created = await Promise.all(
        items.map((item) =>
          tx.assessmentComponent.create({
            data: { schoolId, name: item.name, weight: item.weight, sortOrder: item.sortOrder },
          }),
        ),
      );
      await tx.auditLog.create({
        data: {
          schoolId,
          actorUserId,
          action: "assessmentComponents.replace",
          // Whole-school-scoped, not one row's id — see docs/DECISIONS.md
          // for why this bypasses the standard @Audit()/AuditInterceptor.
          entityType: "assessmentComponents",
          entityId: schoolId,
          // Plain objects, not DTO class instances — Prisma's Json input
          // requires structurally plain, serializable data.
          metadata: { components: items.map((item) => ({ ...item })) },
        },
      });
      return created.sort((a, b) => a.sortOrder - b.sortOrder);
    });
  }

  private validate(items: AssessmentComponentItemDto[]): void {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight !== 100) {
      throw new BadRequestException(`Weights must sum to exactly 100 (currently ${totalWeight}).`);
    }

    const names = items.map((item) => item.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new BadRequestException("Component names must be unique.");
    }
  }
}
