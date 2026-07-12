import { Injectable, NotFoundException } from "@nestjs/common";
import type { ClassLevel } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate, Paginated } from "../common/pagination/paginate";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { CreateClassLevelDto } from "./dto/create-class-level.dto";
import { UpdateClassLevelDto } from "./dto/update-class-level.dto";

@Injectable()
export class ClassLevelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(page: number, pageSize: number): Promise<Paginated<ClassLevel>> {
    const where = forSchool(this.tenantContext.schoolId);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.classLevel.findMany({
        where,
        orderBy: [{ rank: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.classLevel.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  async create(dto: CreateClassLevelDto): Promise<ClassLevel> {
    try {
      return await this.prisma.classLevel.create({
        data: forSchool(this.tenantContext.schoolId, { name: dto.name, rank: dto.rank }),
      });
    } catch (error) {
      throwIfUniqueConstraint(error, "A class level with this name already exists.");
    }
  }

  async update(id: string, dto: UpdateClassLevelDto): Promise<ClassLevel> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, id);
    try {
      return await this.prisma.classLevel.update({ where: { id }, data: dto });
    } catch (error) {
      throwIfUniqueConstraint(error, "A class level with this name already exists.");
    }
  }

  private async findOneOrThrow(schoolId: string, id: string): Promise<ClassLevel> {
    const level = await this.prisma.classLevel.findFirst({ where: forSchool(schoolId, { id }) });
    if (!level) {
      throw new NotFoundException("Class level not found.");
    }
    return level;
  }
}
