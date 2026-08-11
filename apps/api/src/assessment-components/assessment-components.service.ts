import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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
      where: forSchool(schoolId, { deletedAt: null }),
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }

  // Matches incoming items against existing (non-deleted) rows by id, so an
  // unchanged component keeps its id and any student_scores referencing it
  // stay valid. Items with no id are new components. Existing rows with no
  // matching incoming id are "removed": soft-deleted if any student_scores
  // row references them (student_scores.component_id is FK RESTRICT — a
  // hard delete would error, and CASCADE would silently destroy scores),
  // otherwise hard-deleted, matching pre-v0.4 behavior for untouched
  // components. See SPEC_V0.4.md §1 resolution and docs/DECISIONS.md.
  async replaceAll(items: AssessmentComponentItemDto[], actorUserId: string): Promise<AssessmentComponent[]> {
    const schoolId = this.tenantContext.schoolId;
    this.validate(items);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.assessmentComponent.findMany({ where: { schoolId, deletedAt: null } });
      const existingById = new Map(existing.map((row) => [row.id, row]));

      for (const item of items) {
        if (item.id && !existingById.has(item.id)) {
          throw new NotFoundException(`Assessment component "${item.id}" was not found.`);
        }
      }

      const incomingIds = new Set(items.filter((item) => item.id).map((item) => item.id!));
      const removed = existing.filter((row) => !incomingIds.has(row.id));

      for (const row of removed) {
        const scoreCount = await tx.studentScore.count({ where: { componentId: row.id } });
        if (scoreCount > 0) {
          await tx.assessmentComponent.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
        } else {
          await tx.assessmentComponent.delete({ where: { id: row.id } });
        }
      }

      const saved = await Promise.all(
        items.map((item) => {
          const data = {
            name: item.name,
            weight: item.weight,
            sortOrder: item.sortOrder,
            requiresApproval: item.requiresApproval ?? false,
            maxScore: item.maxScore ?? 100,
          };
          return item.id
            ? tx.assessmentComponent.update({ where: { id: item.id }, data })
            : tx.assessmentComponent.create({ data: { schoolId, ...data } });
        }),
      );

      await tx.auditLog.create({
        data: {
          schoolId,
          actorUserId,
          action: "assessmentComponents.replace",
          entityType: "assessmentComponents",
          entityId: schoolId,
          metadata: { components: items.map((item) => ({ ...item })) },
        },
      });

      return saved.sort((a, b) => a.sortOrder - b.sortOrder);
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
