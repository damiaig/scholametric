import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Student, StudentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate } from "../common/pagination/paginate";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { CreateStudentDto } from "./dto/create-student.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";
import { WithdrawStudentDto } from "./dto/withdraw-student.dto";
import { TransferClassDto } from "./dto/transfer-class.dto";
import { ListStudentsQueryDto } from "./dto/list-students-query.dto";
import { resolveOrCreateGuardian } from "./resolve-guardian.util";

const ADMISSION_NUMBER_SEQUENCE_LENGTH = 4;

const currentEnrollmentInclude = {
  where: { session: { isCurrent: true } },
  include: { classArm: { include: { classLevel: true } }, session: true },
  take: 1,
} satisfies Prisma.Student$enrollmentsArgs;

// List: only the primary guardian (one row, cheap). Detail: every link,
// primary first (SPEC_V0.2.md §2 — the list may show primary guardian
// name/phone; the detail page shows the full guardians array).
const studentListInclude = {
  enrollments: currentEnrollmentInclude,
  studentGuardians: { where: { isPrimary: true }, take: 1, include: { guardian: true } },
} satisfies Prisma.StudentInclude;

const studentDetailInclude = {
  enrollments: currentEnrollmentInclude,
  studentGuardians: { include: { guardian: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
} satisfies Prisma.StudentInclude;

type StudentListRow = Prisma.StudentGetPayload<{ include: typeof studentListInclude }>;
type StudentDetailRow = Prisma.StudentGetPayload<{ include: typeof studentDetailInclude }>;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(query: ListStudentsQueryDto) {
    const schoolId = this.tenantContext.schoolId;
    const where: Prisma.StudentWhereInput = {
      ...forSchool(schoolId, { deletedAt: null }),
      status: query.status ?? { not: StudentStatus.WITHDRAWN },
    };

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { admissionNumber: { contains: query.search, mode: "insensitive" } },
      ];
    }

    if (query.classArmId) {
      where.enrollments = { some: { classArmId: query.classArmId, session: { isCurrent: true } } };
    }

    // Includes the same current-enrollment shape as findOne — the students
    // list page (step 7) needs class/level per row, not just a bare Student.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: studentListInclude,
      }),
      this.prisma.student.count({ where }),
    ]);
    return paginate(items.map((item) => this.toListItem(item)), total, query.page, query.pageSize);
  }

  async findOne(id: string) {
    const schoolId = this.tenantContext.schoolId;
    const student = await this.prisma.student.findFirst({
      where: forSchool(schoolId, { id, deletedAt: null }),
      include: studentDetailInclude,
    });
    if (!student) {
      throw new NotFoundException("Student not found.");
    }
    return this.toDetail(student);
  }

  // v0.2 (SPEC_V0.2.md §2, a deliberate breaking change — see
  // docs/DECISIONS.md): guardians come from dto.guardians[] and are written
  // only to guardians/student_guardians. The frozen legacy columns
  // (guardian_name/guardian_phone are NOT NULL, no migration this step)
  // are populated FROM the resolved primary guardian so the pre-v0.2
  // frontend — which still reads them until its own guardians UI ships —
  // shows real data for students created from here on, not placeholders.
  async create(dto: CreateStudentDto) {
    const schoolId = this.tenantContext.schoolId;
    const primaryIndex = this.resolvePrimaryIndex(dto.guardians);

    return this.prisma.$transaction(async (tx) => {
      const school = await tx.school.findUniqueOrThrow({ where: { id: schoolId } });
      const classArm = await tx.classArm.findFirst({ where: forSchool(schoolId, { id: dto.classArmId }) });
      if (!classArm) {
        throw new NotFoundException("Class arm not found.");
      }
      const session = await tx.academicSession.findFirst({ where: forSchool(schoolId, { isCurrent: true }) });
      if (!session) {
        throw new BadRequestException("No current academic session configured for this school.");
      }

      const resolvedGuardians = await Promise.all(
        dto.guardians.map((guardianInput) => resolveOrCreateGuardian(tx, schoolId, guardianInput)),
      );
      const primaryGuardian = resolvedGuardians[primaryIndex];

      const admissionNumber =
        dto.admissionNumber ??
        (await this.generateAdmissionNumber(tx, schoolId, school.slug, session.startsOn.getUTCFullYear()));

      let student: Student;
      try {
        student = await tx.student.create({
          data: {
            schoolId,
            admissionNumber,
            firstName: dto.firstName,
            lastName: dto.lastName,
            middleName: dto.middleName,
            gender: dto.gender,
            dateOfBirth: dto.dateOfBirth,
            guardianName: `${primaryGuardian.firstName} ${primaryGuardian.lastName}`,
            guardianPhone: primaryGuardian.phone,
            guardianEmail: primaryGuardian.email,
            address: primaryGuardian.address,
          },
        });
      } catch (error) {
        throwIfUniqueConstraint(error, "A student with this admission number already exists.");
      }

      await tx.studentEnrollment.create({
        data: { schoolId, studentId: student.id, classArmId: dto.classArmId, sessionId: session.id },
      });

      await tx.studentGuardian.createMany({
        data: resolvedGuardians.map((guardian, index) => ({
          schoolId,
          studentId: student.id,
          guardianId: guardian.id,
          relationship: dto.guardians[index].relationship,
          isPrimary: index === primaryIndex,
        })),
      });

      return student;
    });
  }

  async update(id: string, dto: UpdateStudentDto): Promise<Student> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, id);
    return this.prisma.student.update({ where: { id }, data: dto });
  }

  // _dto.reason isn't a student column — it lands in the audit log's
  // metadata via AuditInterceptor (which snapshots the raw request body).
  // Kept as a parameter so the controller/DTO validation shape is explicit.
  async withdraw(id: string, _dto: WithdrawStudentDto): Promise<Student> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, id);
    return this.prisma.student.update({ where: { id }, data: { status: StudentStatus.WITHDRAWN } });
  }

  async transferClass(id: string, dto: TransferClassDto): Promise<Student> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, id);

    const classArm = await this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: dto.classArmId }) });
    if (!classArm) {
      throw new NotFoundException("Class arm not found.");
    }

    const session = await this.prisma.academicSession.findFirst({ where: forSchool(schoolId, { isCurrent: true }) });
    if (!session) {
      throw new BadRequestException("No current academic session configured for this school.");
    }

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: { studentId: id, sessionId: session.id },
    });
    if (!enrollment) {
      throw new NotFoundException("No enrollment found for the current session.");
    }

    await this.prisma.studentEnrollment.update({
      where: { id: enrollment.id },
      data: { classArmId: dto.classArmId },
    });
    return this.prisma.student.findUniqueOrThrow({ where: { id } });
  }

  private async findOneOrThrow(schoolId: string, id: string): Promise<Student> {
    const student = await this.prisma.student.findFirst({ where: forSchool(schoolId, { id, deletedAt: null }) });
    if (!student) {
      throw new NotFoundException("Student not found.");
    }
    return student;
  }

  private toListItem(student: StudentListRow) {
    const { enrollments, studentGuardians, ...rest } = student;
    const primary = studentGuardians[0];
    return {
      ...rest,
      currentEnrollment: enrollments[0] ?? null,
      primaryGuardian: primary
        ? {
            guardianId: primary.guardian.id,
            firstName: primary.guardian.firstName,
            lastName: primary.guardian.lastName,
            phone: primary.guardian.phone,
          }
        : null,
    };
  }

  private toDetail(student: StudentDetailRow) {
    const { enrollments, studentGuardians, ...rest } = student;
    return {
      ...rest,
      currentEnrollment: enrollments[0] ?? null,
      guardians: studentGuardians.map((link) => ({
        guardianId: link.guardian.id,
        relationship: link.relationship,
        isPrimary: link.isPrimary,
        firstName: link.guardian.firstName,
        lastName: link.guardian.lastName,
        phone: link.guardian.phone,
        email: link.guardian.email,
        address: link.guardian.address,
      })),
    };
  }

  // "Exactly one primary or first-is-primary default" (SPEC_V0.2.md §2).
  private resolvePrimaryIndex(guardians: CreateStudentDto["guardians"]): number {
    const explicitPrimaryIndices = guardians.reduce<number[]>((acc, guardian, index) => {
      if (guardian.isPrimary) acc.push(index);
      return acc;
    }, []);
    if (explicitPrimaryIndices.length > 1) {
      throw new BadRequestException("Only one guardian can be marked primary.");
    }
    return explicitPrimaryIndices.length === 1 ? explicitPrimaryIndices[0] : 0;
  }

  /**
   * {slug prefix}/{session start year}/{4-digit sequence}, sequence reset
   * per (school, year). An advisory transaction lock keyed on the same pair
   * serializes concurrent allocation — no dedicated sequence table needed
   * (schema changes are out of scope this step). See docs/DECISIONS.md.
   */
  private async generateAdmissionNumber(
    tx: Prisma.TransactionClient,
    schoolId: string,
    slug: string,
    sessionStartYear: number,
  ): Promise<string> {
    const prefix = slug.slice(0, 3).toUpperCase();
    const yearPrefix = `${prefix}/${sessionStartYear}/`;

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${schoolId}:${sessionStartYear}`}))`;

    const last = await tx.student.findFirst({
      where: { schoolId, admissionNumber: { startsWith: yearPrefix } },
      orderBy: { admissionNumber: "desc" },
      select: { admissionNumber: true },
    });
    // A caller-supplied admissionNumber sharing this prefix/year but with a
    // non-numeric suffix would otherwise poison the *next* generated number
    // with NaN — fall back to 0 (i.e. ignore it for sequencing purposes).
    const lastSequence = last ? Number(last.admissionNumber.slice(yearPrefix.length)) || 0 : 0;
    const nextSequence = lastSequence + 1;
    return `${yearPrefix}${String(nextSequence).padStart(ADMISSION_NUMBER_SEQUENCE_LENGTH, "0")}`;
  }
}
