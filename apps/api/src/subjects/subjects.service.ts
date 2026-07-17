import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Subject } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate, Paginated } from "../common/pagination/paginate";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { CreateSubjectDto } from "./dto/create-subject.dto";
import { UpdateSubjectDto } from "./dto/update-subject.dto";
import { SetSubjectLevelsDto } from "./dto/set-subject-levels.dto";

export interface SubjectWithLevels extends Subject {
  classLevels: { id: string; name: string; rank: number }[];
}

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(page: number, pageSize: number): Promise<Paginated<Subject>> {
    const where = forSchool(this.tenantContext.schoolId, { deletedAt: null });
    const [items, total] = await this.prisma.$transaction([
      this.prisma.subject.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.subject.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  async create(dto: CreateSubjectDto): Promise<Subject> {
    try {
      return await this.prisma.subject.create({
        data: forSchool(this.tenantContext.schoolId, { name: dto.name, code: dto.code }),
      });
    } catch (error) {
      throwIfUniqueConstraint(error, "A subject with this name already exists.");
    }
  }

  async update(id: string, dto: UpdateSubjectDto): Promise<Subject> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, id);
    try {
      return await this.prisma.subject.update({ where: { id }, data: dto });
    } catch (error) {
      throwIfUniqueConstraint(error, "A subject with this name already exists.");
    }
  }

  // Soft delete, blocked if the subject has any teacher assignment (any
  // session — a past assignment is still a real dependency worth surfacing,
  // SPEC_V0.2.md §2).
  async remove(id: string): Promise<{ id: string }> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, id);

    const assignmentCount = await this.prisma.subjectTeacherAssignment.count({ where: { subjectId: id } });
    if (assignmentCount > 0) {
      throw new ConflictException("This subject has teacher assignments and cannot be deleted.");
    }

    await this.prisma.subject.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }

  async setLevels(id: string, dto: SetSubjectLevelsDto): Promise<SubjectWithLevels> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, id);

    if (dto.classLevelIds.length > 0) {
      const matchingLevels = await this.prisma.classLevel.count({
        where: forSchool(schoolId, { id: { in: dto.classLevelIds } }),
      });
      if (matchingLevels !== dto.classLevelIds.length) {
        throw new NotFoundException("One or more class levels don't belong to this school.");
      }
    }

    await this.prisma.$transaction([
      this.prisma.subjectClassLevel.deleteMany({ where: { subjectId: id } }),
      this.prisma.subjectClassLevel.createMany({
        data: dto.classLevelIds.map((classLevelId) => ({ schoolId, subjectId: id, classLevelId })),
      }),
    ]);

    return this.findWithLevelsOrThrow(schoolId, id);
  }

  private async findOneOrThrow(schoolId: string, id: string): Promise<Subject> {
    const subject = await this.prisma.subject.findFirst({ where: forSchool(schoolId, { id, deletedAt: null }) });
    if (!subject) {
      throw new NotFoundException("Subject not found.");
    }
    return subject;
  }

  private async findWithLevelsOrThrow(schoolId: string, id: string): Promise<SubjectWithLevels> {
    const subject = await this.prisma.subject.findFirst({
      where: forSchool(schoolId, { id, deletedAt: null }),
      include: { classLevels: { include: { classLevel: true } } },
    });
    if (!subject) {
      throw new NotFoundException("Subject not found.");
    }
    const { classLevels, ...rest } = subject;
    return {
      ...rest,
      classLevels: classLevels
        .map((entry) => entry.classLevel)
        .sort((a, b) => a.rank - b.rank)
        .map((level) => ({ id: level.id, name: level.name, rank: level.rank })),
    };
  }
}
