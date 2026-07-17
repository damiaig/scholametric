import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AcademicSession } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate, Paginated } from "../common/pagination/paginate";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { CreateSessionDto } from "./dto/create-session.dto";
import { UpdateSessionDto } from "./dto/update-session.dto";
import { ActivateSessionDto } from "./dto/activate-session.dto";

export interface SessionActivationPreview {
  targetSession: { name: string; enrollmentCount: number };
  currentSession: { name: string; enrollmentCount: number } | null;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(page: number, pageSize: number): Promise<Paginated<AcademicSession>> {
    const where = forSchool(this.tenantContext.schoolId);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.academicSession.findMany({
        where,
        orderBy: [{ startsOn: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.academicSession.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  async create(dto: CreateSessionDto): Promise<AcademicSession> {
    try {
      return await this.prisma.academicSession.create({
        data: forSchool(this.tenantContext.schoolId, {
          name: dto.name,
          startsOn: new Date(dto.startsOn),
          endsOn: new Date(dto.endsOn),
        }),
      });
    } catch (error) {
      throwIfUniqueConstraint(error, "A session with this name already exists.");
    }
  }

  async update(id: string, dto: UpdateSessionDto): Promise<AcademicSession> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, id);
    try {
      return await this.prisma.academicSession.update({
        where: { id },
        data: {
          name: dto.name,
          startsOn: dto.startsOn ? new Date(dto.startsOn) : undefined,
          endsOn: dto.endsOn ? new Date(dto.endsOn) : undefined,
        },
      });
    } catch (error) {
      throwIfUniqueConstraint(error, "A session with this name already exists.");
    }
  }

  // SPEC_V0.2.md §2: the acceptance run showed activating an empty session
  // silently (no confirmation) was a real footgun — students vanish from
  // every list until re-enrolled. This preview lets the caller see both
  // sessions' enrollment counts before confirming.
  async activationPreview(id: string): Promise<SessionActivationPreview> {
    const schoolId = this.tenantContext.schoolId;
    const target = await this.findOneOrThrow(schoolId, id);
    const current = await this.prisma.academicSession.findFirst({ where: forSchool(schoolId, { isCurrent: true }) });

    const [targetCount, currentCount] = await Promise.all([
      this.prisma.studentEnrollment.count({ where: forSchool(schoolId, { sessionId: target.id }) }),
      current
        ? this.prisma.studentEnrollment.count({ where: forSchool(schoolId, { sessionId: current.id }) })
        : Promise.resolve(0),
    ]);

    return {
      targetSession: { name: target.name, enrollmentCount: targetCount },
      currentSession: current ? { name: current.name, enrollmentCount: currentCount } : null,
    };
  }

  async activate(id: string, dto: ActivateSessionDto): Promise<AcademicSession> {
    const schoolId = this.tenantContext.schoolId;
    const target = await this.findOneOrThrow(schoolId, id);

    if (dto.confirmName !== target.name) {
      throw new BadRequestException(`Type the session name "${target.name}" exactly to confirm activation.`);
    }

    // Deactivate-then-activate, in that order, inside one transaction: the
    // partial unique index on (school_id) WHERE is_current is checked
    // per-statement (not deferred), so activating first would momentarily
    // hold two current sessions for this school and violate it.
    const [, activated] = await this.prisma.$transaction([
      this.prisma.academicSession.updateMany({
        where: forSchool(schoolId, { isCurrent: true, NOT: { id } }),
        data: { isCurrent: false },
      }),
      this.prisma.academicSession.update({ where: { id }, data: { isCurrent: true } }),
    ]);
    return activated;
  }

  private async findOneOrThrow(schoolId: string, id: string): Promise<AcademicSession> {
    const session = await this.prisma.academicSession.findFirst({ where: forSchool(schoolId, { id }) });
    if (!session) {
      throw new NotFoundException("Session not found.");
    }
    return session;
  }
}
