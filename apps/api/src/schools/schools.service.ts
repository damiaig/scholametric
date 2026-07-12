import { Injectable, NotFoundException } from "@nestjs/common";
import bcrypt from "bcrypt";
import type { School, User } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { paginate, Paginated } from "../common/pagination/paginate";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { BCRYPT_COST } from "../auth/auth.constants";
import { CreateSchoolDto } from "./dto/create-school.dto";
import { UpdateSchoolDto } from "./dto/update-school.dto";

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

export interface SchoolSearchResult {
  id: string;
  name: string;
  slug: string;
}

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSchoolDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const school = await tx.school.create({
          data: { name: dto.name, slug: dto.slug, type: dto.type },
        });
        const passwordHash = await bcrypt.hash(dto.admin.password, BCRYPT_COST);
        const admin = await tx.user.create({
          data: {
            schoolId: school.id,
            email: dto.admin.email,
            passwordHash,
            firstName: dto.admin.firstName,
            lastName: dto.admin.lastName,
            role: UserRole.SCHOOL_ADMIN,
          },
        });
        return { ...school, admin: this.toAdminSummary(admin) };
      });
    } catch (error) {
      throwIfUniqueConstraint(error, "A school with this slug already exists.");
    }
  }

  async findAll(page: number, pageSize: number): Promise<Paginated<School>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.school.findMany({
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.school.count(),
    ]);
    return paginate(items, total, page, pageSize);
  }

  async findOne(id: string): Promise<School> {
    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) {
      throw new NotFoundException("School not found.");
    }
    return school;
  }

  async update(id: string, dto: UpdateSchoolDto): Promise<School> {
    await this.findOne(id);
    return this.prisma.school.update({ where: { id }, data: dto });
  }

  private toAdminSummary(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }

  async search(q: string | undefined): Promise<SchoolSearchResult[]> {
    const query = (q ?? "").trim();
    if (query.length < MIN_QUERY_LENGTH) {
      return [];
    }

    return this.prisma.school.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ name: { contains: query, mode: "insensitive" } }, { slug: { contains: query, mode: "insensitive" } }],
      },
      select: { id: true, name: true, slug: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: MAX_RESULTS,
    });
  }
}
