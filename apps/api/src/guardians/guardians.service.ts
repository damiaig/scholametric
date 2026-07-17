import { Injectable, NotFoundException } from "@nestjs/common";
import type { Guardian } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { UpdateGuardianDto } from "./dto/update-guardian.dto";

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  // Sibling case: this guardian may be linked to several students
  // (student_guardians rows) — patching here updates the one shared
  // guardian record, so every linked student reflects it immediately.
  async update(id: string, dto: UpdateGuardianDto): Promise<Guardian> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, id);
    return this.prisma.guardian.update({ where: { id }, data: dto });
  }

  private async findOneOrThrow(schoolId: string, id: string): Promise<Guardian> {
    const guardian = await this.prisma.guardian.findFirst({ where: forSchool(schoolId, { id, deletedAt: null }) });
    if (!guardian) {
      throw new NotFoundException("Guardian not found.");
    }
    return guardian;
  }
}
