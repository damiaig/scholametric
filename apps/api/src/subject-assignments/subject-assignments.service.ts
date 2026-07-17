import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { SubjectTeacherAssignment, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { CreateSubjectAssignmentDto } from "./dto/create-subject-assignment.dto";

@Injectable()
export class SubjectAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  // Immutable insert, not an upsert-replace like class-teacher: a taken
  // (subject, arm, session) slot 409s naming the current holder — the
  // caller must DELETE then POST to reassign (SPEC_V0.2.md §2).
  async create(dto: CreateSubjectAssignmentDto): Promise<SubjectTeacherAssignment> {
    const schoolId = this.tenantContext.schoolId;
    await this.assertSubjectInTenant(schoolId, dto.subjectId);
    await this.assertClassArmInTenant(schoolId, dto.classArmId);
    await this.assertTeacherInTenant(schoolId, dto.teacherUserId);
    const session = await this.getCurrentSessionOrThrow(schoolId);

    const existing = await this.prisma.subjectTeacherAssignment.findFirst({
      where: { subjectId: dto.subjectId, classArmId: dto.classArmId, sessionId: session.id },
      include: { teacherUser: true },
    });
    if (existing) {
      throw new ConflictException(
        `This subject is already assigned to ${existing.teacherUser.firstName} ${existing.teacherUser.lastName} for this class.`,
      );
    }

    return this.prisma.subjectTeacherAssignment.create({
      data: {
        schoolId,
        subjectId: dto.subjectId,
        classArmId: dto.classArmId,
        sessionId: session.id,
        teacherUserId: dto.teacherUserId,
      },
    });
  }

  async remove(id: string): Promise<{ id: string }> {
    const schoolId = this.tenantContext.schoolId;
    const assignment = await this.prisma.subjectTeacherAssignment.findFirst({ where: forSchool(schoolId, { id }) });
    if (!assignment) {
      throw new NotFoundException("Subject assignment not found.");
    }
    await this.prisma.subjectTeacherAssignment.delete({ where: { id } });
    return { id };
  }

  private async assertSubjectInTenant(schoolId: string, subjectId: string): Promise<void> {
    const subject = await this.prisma.subject.findFirst({ where: forSchool(schoolId, { id: subjectId, deletedAt: null }) });
    if (!subject) {
      throw new NotFoundException("Subject not found.");
    }
  }

  private async assertClassArmInTenant(schoolId: string, classArmId: string): Promise<void> {
    const classArm = await this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: classArmId }) });
    if (!classArm) {
      throw new NotFoundException("Class arm not found.");
    }
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

  private async getCurrentSessionOrThrow(schoolId: string) {
    const session = await this.prisma.academicSession.findFirst({ where: forSchool(schoolId, { isCurrent: true }) });
    if (!session) {
      throw new BadRequestException("No current academic session configured for this school.");
    }
    return session;
  }
}
