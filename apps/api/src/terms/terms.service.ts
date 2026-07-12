import { Injectable, NotFoundException } from "@nestjs/common";
import type { Term } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate, Paginated } from "../common/pagination/paginate";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { CreateTermDto } from "./dto/create-term.dto";

@Injectable()
export class TermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(sessionId: string, page: number, pageSize: number): Promise<Paginated<Term>> {
    const where = forSchool(this.tenantContext.schoolId, { sessionId });
    const [items, total] = await this.prisma.$transaction([
      this.prisma.term.findMany({
        where,
        orderBy: [{ startsOn: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.term.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  async create(dto: CreateTermDto): Promise<Term> {
    const schoolId = this.tenantContext.schoolId;
    const session = await this.prisma.academicSession.findFirst({
      where: forSchool(schoolId, { id: dto.sessionId }),
    });
    if (!session) {
      throw new NotFoundException("Session not found.");
    }

    try {
      return await this.prisma.term.create({
        data: forSchool(schoolId, {
          sessionId: dto.sessionId,
          name: dto.name,
          startsOn: new Date(dto.startsOn),
          endsOn: new Date(dto.endsOn),
        }),
      });
    } catch (error) {
      throwIfUniqueConstraint(error, "This term already exists for the session.");
    }
  }

  async activate(id: string): Promise<Term> {
    const schoolId = this.tenantContext.schoolId;
    const term = await this.prisma.term.findFirst({ where: forSchool(schoolId, { id }) });
    if (!term) {
      throw new NotFoundException("Term not found.");
    }

    // Same deactivate-then-activate ordering as sessions, scoped to the
    // partial unique index on (session_id) WHERE is_current for terms.
    const [, activated] = await this.prisma.$transaction([
      this.prisma.term.updateMany({
        where: forSchool(schoolId, { sessionId: term.sessionId, isCurrent: true, NOT: { id } }),
        data: { isCurrent: false },
      }),
      this.prisma.term.update({ where: { id }, data: { isCurrent: true } }),
    ]);
    return activated;
  }
}
