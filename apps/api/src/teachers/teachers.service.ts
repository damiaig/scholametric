import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate, Paginated } from "../common/pagination/paginate";
import { PersonnelSummary, toPersonnelSummary } from "../personnel/personnel.service";

export interface ListTeachersParams {
  search?: string;
  page: number;
  pageSize: number;
}

export interface ClassTeacherOfEntry {
  classArmId: string;
  className: string;
  sessionId: string;
  sessionName: string;
}

export interface SubjectTaughtEntry {
  id: string;
  subjectId: string;
  subjectName: string;
  classArmId: string;
  className: string;
}

export interface TeacherDetail extends PersonnelSummary {
  classTeacherOf: ClassTeacherOfEntry[];
  subjectsTaught: SubjectTaughtEntry[];
}

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(query: ListTeachersParams): Promise<Paginated<PersonnelSummary>> {
    const schoolId = this.tenantContext.schoolId;
    const where: Prisma.StaffProfileWhereInput = {
      schoolId,
      deletedAt: null,
      user: {
        role: UserRole.TEACHER,
        deletedAt: null,
        ...(query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: "insensitive" as const } },
                { lastName: { contains: query.search, mode: "insensitive" as const } },
                { email: { contains: query.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.staffProfile.findMany({
        where,
        include: { user: true },
        orderBy: [{ user: { firstName: "asc" } }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.staffProfile.count({ where }),
    ]);
    return paginate(items.map(toPersonnelSummary), total, query.page, query.pageSize);
  }

  // Three focused queries regardless of data size (profile, class-teacher
  // assignments, subject-teacher assignments) — no N+1 (SPEC_V0.2.md §5).
  async findOne(userId: string): Promise<TeacherDetail> {
    const schoolId = this.tenantContext.schoolId;
    const profile = await this.prisma.staffProfile.findFirst({
      where: forSchool(schoolId, { userId, deletedAt: null, user: { role: UserRole.TEACHER, deletedAt: null } }),
      include: { user: true },
    });
    if (!profile) {
      throw new NotFoundException("Teacher not found.");
    }

    const [classTeacherAssignments, subjectTeacherAssignments] = await Promise.all([
      this.prisma.classTeacherAssignment.findMany({
        where: forSchool(schoolId, { teacherUserId: userId, session: { isCurrent: true } }),
        include: { classArm: { include: { classLevel: true } }, session: true },
      }),
      this.prisma.subjectTeacherAssignment.findMany({
        where: forSchool(schoolId, { teacherUserId: userId, session: { isCurrent: true } }),
        include: { subject: true, classArm: { include: { classLevel: true } } },
      }),
    ]);

    return {
      ...toPersonnelSummary(profile),
      classTeacherOf: classTeacherAssignments.map((assignment) => ({
        classArmId: assignment.classArmId,
        className: `${assignment.classArm.classLevel.name} ${assignment.classArm.name}`,
        sessionId: assignment.sessionId,
        sessionName: assignment.session.name,
      })),
      subjectsTaught: subjectTeacherAssignments.map((assignment) => ({
        id: assignment.id,
        subjectId: assignment.subjectId,
        subjectName: assignment.subject.name,
        classArmId: assignment.classArmId,
        className: `${assignment.classArm.classLevel.name} ${assignment.classArm.name}`,
      })),
    };
  }
}
