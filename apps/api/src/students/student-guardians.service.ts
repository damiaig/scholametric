import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Guardian, GuardianRelationship, StudentGuardian } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { AddStudentGuardianDto } from "./dto/add-student-guardian.dto";
import { resolveOrCreateGuardian } from "./resolve-guardian.util";

export interface StudentGuardianSummary {
  id: string;
  guardianId: string;
  relationship: GuardianRelationship;
  isPrimary: boolean;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  address: string | null;
}

function toSummary(link: StudentGuardian & { guardian: Guardian }): StudentGuardianSummary {
  return {
    id: link.id,
    guardianId: link.guardianId,
    relationship: link.relationship,
    isPrimary: link.isPrimary,
    firstName: link.guardian.firstName,
    lastName: link.guardian.lastName,
    phone: link.guardian.phone,
    email: link.guardian.email,
    address: link.guardian.address,
  };
}

@Injectable()
export class StudentGuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(studentId: string): Promise<StudentGuardianSummary[]> {
    const schoolId = this.tenantContext.schoolId;
    await this.assertStudentInTenant(schoolId, studentId);

    const links = await this.prisma.studentGuardian.findMany({
      where: { schoolId, studentId },
      include: { guardian: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
    return links.map(toSummary);
  }

  // First guardian ever linked to this student always becomes primary;
  // every subsequent add is deliberately never primary, regardless of
  // caller input (there is none — AddStudentGuardianDto has no isPrimary
  // field) — "adding does not steal primary" (SPEC_V0.2.md §2).
  async add(studentId: string, dto: AddStudentGuardianDto): Promise<StudentGuardianSummary> {
    const schoolId = this.tenantContext.schoolId;
    await this.assertStudentInTenant(schoolId, studentId);

    return this.prisma.$transaction(async (tx) => {
      const guardian = await resolveOrCreateGuardian(tx, schoolId, dto);
      const existingLinksCount = await tx.studentGuardian.count({ where: { studentId } });

      let link: StudentGuardian;
      try {
        link = await tx.studentGuardian.create({
          data: {
            schoolId,
            studentId,
            guardianId: guardian.id,
            relationship: dto.relationship,
            isPrimary: existingLinksCount === 0,
          },
        });
      } catch (error) {
        throwIfUniqueConstraint(error, "This guardian is already linked to this student.");
      }

      return toSummary({ ...link, guardian });
    });
  }

  // Unlink rules (SPEC_V0.2.md §2): primary while other links exist -> 409
  // (reassign primary first); the last link -> requires ?force=true; a
  // guardian left with zero links anywhere in the school afterward is
  // soft-deleted (dead data otherwise — no endpoint lists "unlinked
  // guardians" and none is planned).
  async remove(studentId: string, guardianId: string, force: boolean): Promise<{ id: string }> {
    const schoolId = this.tenantContext.schoolId;
    await this.assertStudentInTenant(schoolId, studentId);

    const link = await this.prisma.studentGuardian.findFirst({ where: { schoolId, studentId, guardianId } });
    if (!link) {
      throw new NotFoundException("This guardian is not linked to this student.");
    }

    const totalLinksForStudent = await this.prisma.studentGuardian.count({ where: { studentId } });

    if (link.isPrimary && totalLinksForStudent > 1) {
      throw new ConflictException(
        "This is the student's primary guardian. Reassign primary to another guardian first.",
      );
    }
    if (totalLinksForStudent === 1 && !force) {
      throw new BadRequestException("This is the student's only guardian. Pass ?force=true to remove them anyway.");
    }

    await this.prisma.studentGuardian.delete({ where: { id: link.id } });

    const remainingLinksSchoolWide = await this.prisma.studentGuardian.count({ where: { guardianId } });
    if (remainingLinksSchoolWide === 0) {
      await this.prisma.guardian.update({ where: { id: guardianId }, data: { deletedAt: new Date() } });
    }

    return { id: link.id };
  }

  // Deactivate-then-activate, same order as SessionsService.activate — but
  // unlike that precedent, this locks every link row for the student with
  // SELECT ... FOR UPDATE before touching them. Without the lock, two
  // concurrent swaps to different targets can each read "no other primary
  // to deactivate" before the other's write is visible, then both try to
  // activate: the second one to commit hits the partial unique index and
  // 500s instead of losing gracefully. Verified against a 6-way concurrent
  // Promise.all in guardians.e2e-spec.ts. See docs/DECISIONS.md.
  async setPrimary(studentId: string, guardianId: string): Promise<StudentGuardianSummary> {
    const schoolId = this.tenantContext.schoolId;
    await this.assertStudentInTenant(schoolId, studentId);

    return this.prisma.$transaction(async (tx) => {
      // ORDER BY id is load-bearing: without a fixed lock-acquisition order,
      // concurrent swaps on the same student can deadlock instead of
      // serializing (seen under a 6-way concurrent test — Postgres aborts
      // one side with a 40P01 rather than queueing it).
      await tx.$queryRaw`SELECT id FROM student_guardians WHERE student_id = ${studentId}::uuid ORDER BY id FOR UPDATE`;

      const target = await tx.studentGuardian.findFirst({
        where: { schoolId, studentId, guardianId },
        include: { guardian: true },
      });
      if (!target) {
        throw new NotFoundException("This guardian is not linked to this student.");
      }

      await tx.studentGuardian.updateMany({
        where: { studentId, NOT: { id: target.id } },
        data: { isPrimary: false },
      });
      const activated = await tx.studentGuardian.update({ where: { id: target.id }, data: { isPrimary: true } });

      return toSummary({ ...activated, guardian: target.guardian });
    });
  }

  private async assertStudentInTenant(schoolId: string, studentId: string): Promise<void> {
    const student = await this.prisma.student.findFirst({ where: forSchool(schoolId, { id: studentId, deletedAt: null }) });
    if (!student) {
      throw new NotFoundException("Student not found.");
    }
  }
}
