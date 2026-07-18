import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ClassArm, ClassTeacherAssignment, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate, Paginated } from "../common/pagination/paginate";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { CreateClassArmDto } from "./dto/create-class-arm.dto";
import { UpdateClassArmDto } from "./dto/update-class-arm.dto";

export interface ClassArmDetail {
  id: string;
  name: string;
  classLevel: { id: string; name: string; rank: number };
  classTeacher: { userId: string; firstName: string; lastName: string } | null;
  subjectTeachers: {
    id: string;
    subjectId: string;
    subjectName: string;
    teacherUserId: string;
    teacherFirstName: string;
    teacherLastName: string;
  }[];
  students: Paginated<{ id: string; firstName: string; lastName: string; admissionNumber: string; status: string }>;
}

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

  /** Upsert-replace for the CURRENT session — no 409, unlike subject assignments (SPEC_V0.2.md §2). */
  async setClassTeacher(classArmId: string, teacherUserId: string): Promise<ClassTeacherAssignment> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, classArmId);
    const session = await this.getCurrentSessionOrThrow(schoolId);
    await this.assertTeacherInTenant(schoolId, teacherUserId);

    return this.prisma.classTeacherAssignment.upsert({
      where: { classArmId_sessionId: { classArmId, sessionId: session.id } },
      update: { teacherUserId },
      create: { schoolId, classArmId, sessionId: session.id, teacherUserId },
    });
  }

  async removeClassTeacher(classArmId: string): Promise<{ id: string }> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, classArmId);
    const session = await this.getCurrentSessionOrThrow(schoolId);

    const assignment = await this.prisma.classTeacherAssignment.findFirst({
      where: { classArmId, sessionId: session.id },
    });
    if (!assignment) {
      throw new NotFoundException("No class teacher assigned for this arm this session.");
    }
    await this.prisma.classTeacherAssignment.delete({ where: { id: assignment.id } });
    return { id: assignment.id };
  }

  // Detail view for the Classes tab (SPEC_V0.2.md §2). Unlike
  // setClassTeacher/removeClassTeacher, a missing current session isn't an
  // error here — it just means nothing to show yet (empty students page,
  // null class teacher), same "no session = empty, not broken" convention
  // as ClassesService/DashboardService.
  async findOne(id: string, page: number, pageSize: number): Promise<ClassArmDetail> {
    const schoolId = this.tenantContext.schoolId;
    const arm = await this.prisma.classArm.findFirst({
      where: forSchool(schoolId, { id }),
      include: { classLevel: true },
    });
    if (!arm) {
      throw new NotFoundException("Class arm not found.");
    }

    const session = await this.prisma.academicSession.findFirst({ where: forSchool(schoolId, { isCurrent: true }) });

    const [classTeacherAssignment, subjectTeacherAssignments, enrollments, enrollmentTotal] = await Promise.all([
      session
        ? this.prisma.classTeacherAssignment.findFirst({
            where: { classArmId: id, sessionId: session.id },
            include: { teacherUser: true },
          })
        : null,
      session
        ? this.prisma.subjectTeacherAssignment.findMany({
            where: { classArmId: id, sessionId: session.id },
            include: { subject: true, teacherUser: true },
            orderBy: { subject: { name: "asc" } },
          })
        : [],
      session
        ? this.prisma.studentEnrollment.findMany({
            where: { classArmId: id, sessionId: session.id },
            include: { student: true },
            orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }, { id: "asc" }],
            skip: (page - 1) * pageSize,
            take: pageSize,
          })
        : [],
      session ? this.prisma.studentEnrollment.count({ where: { classArmId: id, sessionId: session.id } }) : 0,
    ]);

    return {
      id: arm.id,
      name: arm.name,
      classLevel: { id: arm.classLevel.id, name: arm.classLevel.name, rank: arm.classLevel.rank },
      classTeacher: classTeacherAssignment
        ? {
            userId: classTeacherAssignment.teacherUser.id,
            firstName: classTeacherAssignment.teacherUser.firstName,
            lastName: classTeacherAssignment.teacherUser.lastName,
          }
        : null,
      subjectTeachers: subjectTeacherAssignments.map((assignment) => ({
        id: assignment.id,
        subjectId: assignment.subjectId,
        subjectName: assignment.subject.name,
        teacherUserId: assignment.teacherUserId,
        teacherFirstName: assignment.teacherUser.firstName,
        teacherLastName: assignment.teacherUser.lastName,
      })),
      students: paginate(
        enrollments.map((enrollment) => ({
          id: enrollment.student.id,
          firstName: enrollment.student.firstName,
          lastName: enrollment.student.lastName,
          admissionNumber: enrollment.student.admissionNumber,
          status: enrollment.student.status,
        })),
        enrollmentTotal,
        page,
        pageSize,
      ),
    };
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

  private async getCurrentSessionOrThrow(schoolId: string) {
    const session = await this.prisma.academicSession.findFirst({ where: forSchool(schoolId, { isCurrent: true }) });
    if (!session) {
      throw new BadRequestException("No current academic session configured for this school.");
    }
    return session;
  }

  private async assertTeacherInTenant(schoolId: string, teacherUserId: string): Promise<void> {
    const teacher = await this.prisma.user.findFirst({
      where: forSchool(schoolId, { id: teacherUserId, role: UserRole.TEACHER, deletedAt: null }),
      include: { staffProfile: true },
    });
    if (!teacher || !teacher.staffProfile) {
      throw new NotFoundException("Teacher not found.");
    }
  }
}
