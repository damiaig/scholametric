import { BadRequestException, Injectable } from "@nestjs/common";
import type { GradeBoundary } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { GradeBoundaryItemDto } from "./dto/grade-boundary-item.dto";
import { WAEC_9_POINT_PRESET, SIMPLE_A_TO_F_PRESET, GradingPresetRow } from "./grading-presets";

@Injectable()
export class GradeBoundariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(): Promise<GradeBoundary[]> {
    const schoolId = this.tenantContext.schoolId;
    return this.prisma.gradeBoundary.findMany({
      where: forSchool(schoolId),
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }

  findPresets(): { waec9Point: GradingPresetRow[]; simpleAToF: GradingPresetRow[] } {
    return { waec9Point: WAEC_9_POINT_PRESET, simpleAToF: SIMPLE_A_TO_F_PRESET };
  }

  // Full-set atomic replace, same "validate the whole set, then hard
  // delete-and-recreate in one transaction" shape as
  // AssessmentComponentsService.replaceAll — see that file's comment.
  async replaceAll(items: GradeBoundaryItemDto[], actorUserId: string): Promise<GradeBoundary[]> {
    const schoolId = this.tenantContext.schoolId;
    this.validate(items);

    return this.prisma.$transaction(async (tx) => {
      await tx.gradeBoundary.deleteMany({ where: { schoolId } });
      const created = await Promise.all(
        items.map((item) =>
          tx.gradeBoundary.create({
            data: {
              schoolId,
              grade: item.grade,
              minScore: item.minScore,
              maxScore: item.maxScore,
              remark: item.remark,
              sortOrder: item.sortOrder,
            },
          }),
        ),
      );
      await tx.auditLog.create({
        data: {
          schoolId,
          actorUserId,
          action: "gradeBoundaries.replace",
          entityType: "gradeBoundaries",
          entityId: schoolId,
          // Plain objects, not DTO class instances — Prisma's Json input
          // requires structurally plain, serializable data.
          metadata: { boundaries: items.map((item) => ({ ...item })) },
        },
      });
      return created.sort((a, b) => a.sortOrder - b.sortOrder);
    });
  }

  private validate(items: GradeBoundaryItemDto[]): void {
    for (const item of items) {
      if (item.minScore > item.maxScore) {
        throw new BadRequestException(`"${item.grade}"'s minimum score cannot exceed its maximum.`);
      }
    }

    const grades = items.map((item) => item.grade.trim().toLowerCase());
    if (new Set(grades).size !== grades.length) {
      throw new BadRequestException("Grades must be unique.");
    }

    const sorted = [...items].sort((a, b) => a.minScore - b.minScore);
    if (sorted[0].minScore !== 0) {
      throw new BadRequestException("The lowest boundary must start at 0.");
    }
    if (sorted[sorted.length - 1].maxScore !== 100) {
      throw new BadRequestException("The highest boundary must end at 100.");
    }
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (curr.minScore < prev.maxScore + 1) {
        throw new BadRequestException(
          `"${prev.grade}" (${prev.minScore}-${prev.maxScore}) and "${curr.grade}" (${curr.minScore}-${curr.maxScore}) overlap.`,
        );
      }
      if (curr.minScore > prev.maxScore + 1) {
        throw new BadRequestException(`There's a gap between ${prev.maxScore} and ${curr.minScore}.`);
      }
    }
  }
}
