import { Injectable, NotFoundException } from "@nestjs/common";
import type { ClassArm } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate, Paginated } from "../common/pagination/paginate";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { CreateClassArmDto } from "./dto/create-class-arm.dto";
import { UpdateClassArmDto } from "./dto/update-class-arm.dto";

@Injectable()
export class ClassArmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(classLevelId: string | undefined, page: number, pageSize: number): Promise<Paginated<ClassArm>> {
    const where = forSchool(this.tenantContext.schoolId, classLevelId ? { classLevelId } : {});
    const [items, total] = await this.prisma.$transaction([
      this.prisma.classArm.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.classArm.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  async create(dto: CreateClassArmDto): Promise<ClassArm> {
    const schoolId = this.tenantContext.schoolId;
    await this.assertClassLevelInTenant(schoolId, dto.classLevelId);
    try {
      return await this.prisma.classArm.create({
        data: forSchool(schoolId, { name: dto.name, classLevelId: dto.classLevelId }),
      });
    } catch (error) {
      throwIfUniqueConstraint(error, "A class arm with this name already exists for this class level.");
    }
  }

  async update(id: string, dto: UpdateClassArmDto): Promise<ClassArm> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, id);
    if (dto.classLevelId) {
      await this.assertClassLevelInTenant(schoolId, dto.classLevelId);
    }
    try {
      return await this.prisma.classArm.update({ where: { id }, data: dto });
    } catch (error) {
      throwIfUniqueConstraint(error, "A class arm with this name already exists for this class level.");
    }
  }

  private async findOneOrThrow(schoolId: string, id: string): Promise<ClassArm> {
    const arm = await this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id }) });
    if (!arm) {
      throw new NotFoundException("Class arm not found.");
    }
    return arm;
  }

  private async assertClassLevelInTenant(schoolId: string, classLevelId: string): Promise<void> {
    const level = await this.prisma.classLevel.findFirst({ where: forSchool(schoolId, { id: classLevelId }) });
    if (!level) {
      throw new NotFoundException("Class level not found.");
    }
  }
}
