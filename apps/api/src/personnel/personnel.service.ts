import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import bcrypt from "bcrypt";
import { JobTitle, Prisma, StaffProfile, User, UserRole, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate, Paginated } from "../common/pagination/paginate";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { CreatePersonnelDto } from "./dto/create-personnel.dto";
import { UpdatePersonnelDto } from "./dto/update-personnel.dto";

const BCRYPT_COST = 12;
const STAFF_NUMBER_SEQUENCE_LENGTH = 4;
// Excludes visually ambiguous characters (0/O, 1/l/I) — used for
// reset-password, which still generates and reveals a password once.
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generateTemporaryPassword(length = 12): string {
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
  }
  return password;
}

export interface PersonnelSummary {
  // The user's id — deliberately named `id` (not `userId`) so this lines up
  // with AuditInterceptor's generic `response.id` lookup, same as every
  // other audited resource in this API. staffProfileId below covers the
  // rarer case of needing the profile row's own id.
  id: string;
  schoolId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: Date | null;
  staffProfileId: string;
  staffNumber: string;
  jobTitle: JobTitle;
  phone: string | null;
  qualification: string | null;
  dateEmployed: Date | null;
}

export type StaffProfileWithUser = StaffProfile & { user: User };

/** Exported for reuse by TeachersService — teachers are read-shaped personnel + assignments. */
export function toPersonnelSummary(profile: StaffProfileWithUser): PersonnelSummary {
  return {
    id: profile.user.id,
    schoolId: profile.schoolId,
    email: profile.user.email,
    firstName: profile.user.firstName,
    lastName: profile.user.lastName,
    role: profile.user.role,
    status: profile.user.status,
    lastLoginAt: profile.user.lastLoginAt,
    staffProfileId: profile.id,
    staffNumber: profile.staffNumber,
    jobTitle: profile.jobTitle,
    phone: profile.phone,
    qualification: profile.qualification,
    dateEmployed: profile.dateEmployed,
  };
}

export interface ListPersonnelParams {
  role?: UserRole;
  jobTitle?: JobTitle;
  search?: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class PersonnelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(query: ListPersonnelParams): Promise<Paginated<PersonnelSummary>> {
    const schoolId = this.tenantContext.schoolId;
    const where: Prisma.StaffProfileWhereInput = {
      schoolId,
      deletedAt: null,
      ...(query.jobTitle ? { jobTitle: query.jobTitle } : {}),
      user: {
        deletedAt: null,
        ...(query.role ? { role: query.role } : {}),
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

  async create(dto: CreatePersonnelDto): Promise<PersonnelSummary> {
    const schoolId = this.tenantContext.schoolId;

    return this.prisma.$transaction(async (tx) => {
      const school = await tx.school.findUniqueOrThrow({ where: { id: schoolId } });
      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

      let user: User;
      try {
        user = await tx.user.create({
          data: {
            schoolId,
            email: dto.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: dto.role,
            // SPEC_V0.3.md §1: new staff must change their temporary
            // password on first login.
            mustChangePassword: true,
          },
        });
      } catch (error) {
        throwIfUniqueConstraint(error, "A user with this email already exists.");
      }

      const staffNumber = await this.generateStaffNumber(tx, schoolId, school.slug);
      const staffProfile = await tx.staffProfile.create({
        data: {
          schoolId,
          userId: user.id,
          staffNumber,
          jobTitle: dto.jobTitle,
          phone: dto.phone,
          qualification: dto.qualification,
          dateEmployed: dto.dateEmployed ? new Date(dto.dateEmployed) : undefined,
        },
      });

      return toPersonnelSummary({ ...staffProfile, user });
    });
  }

  async update(userId: string, dto: UpdatePersonnelDto, currentUserId: string): Promise<PersonnelSummary> {
    const schoolId = this.tenantContext.schoolId;
    const existing = await this.findProfileOrThrow(schoolId, userId);

    if (userId === currentUserId && dto.role) {
      throw new BadRequestException("You cannot change your own role.");
    }

    if (
      dto.role === UserRole.TEACHER &&
      (existing.user.role === UserRole.PROPRIETOR || existing.user.role === UserRole.SCHOOL_ADMIN)
    ) {
      const remainingAdmins = await this.prisma.user.count({
        where: forSchool(schoolId, {
          role: { in: [UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN] },
          deletedAt: null,
          id: { not: userId },
        }),
      });
      if (remainingAdmins === 0) {
        throw new BadRequestException("Cannot change the last proprietor or school admin at this school to teacher.");
      }
    }

    const [user, staffProfile] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { firstName: dto.firstName, lastName: dto.lastName, role: dto.role, status: dto.status },
      }),
      this.prisma.staffProfile.update({
        where: { id: existing.id },
        data: { jobTitle: dto.jobTitle, phone: dto.phone, qualification: dto.qualification },
      }),
    ]);

    return toPersonnelSummary({ ...staffProfile, user });
  }

  // Deliberately checks the User table, not StaffProfile: this is also
  // reached via the deprecated /users/:id/reset-password alias, which must
  // keep working for any tenant user regardless of whether a staff_profile
  // exists for them (e.g. one predating this version) — a password reset
  // touches users/refresh_tokens only, never staff_profiles.
  async resetPassword(userId: string): Promise<{ temporaryPassword: string }> {
    const schoolId = this.tenantContext.schoolId;
    const user = await this.prisma.user.findFirst({ where: forSchool(schoolId, { id: userId, deletedAt: null }) });
    if (!user) {
      throw new NotFoundException("User not found.");
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);

    // A password reset should also end that user's other active sessions,
    // and forces them through change-password on next login (SPEC_V0.3.md
    // §1) — unlike self-service change-password, this IS a different
    // session (the admin) acting on the target, so revoking the target's
    // sessions here has no "keep the caller's own session" ambiguity.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: true },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { temporaryPassword };
  }

  private async findProfileOrThrow(schoolId: string, userId: string): Promise<StaffProfileWithUser> {
    const profile = await this.prisma.staffProfile.findFirst({
      where: forSchool(schoolId, { userId, deletedAt: null, user: { deletedAt: null } }),
      include: { user: true },
    });
    if (!profile) {
      throw new NotFoundException("Personnel record not found.");
    }
    return profile;
  }

  /**
   * {slug prefix}/STF/{4-digit sequence}, sequence per school (no year
   * component, unlike admission numbers). Same advisory-lock pattern as
   * StudentsService.generateAdmissionNumber — see docs/DECISIONS.md.
   */
  private async generateStaffNumber(tx: Prisma.TransactionClient, schoolId: string, slug: string): Promise<string> {
    const prefix = slug.slice(0, 3).toUpperCase();
    const staffPrefix = `${prefix}/STF/`;

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${schoolId}:staff`}))`;

    const last = await tx.staffProfile.findFirst({
      where: { schoolId, staffNumber: { startsWith: staffPrefix } },
      orderBy: { staffNumber: "desc" },
      select: { staffNumber: true },
    });
    const lastSequence = last ? Number(last.staffNumber.slice(staffPrefix.length)) || 0 : 0;
    const nextSequence = lastSequence + 1;
    return `${staffPrefix}${String(nextSequence).padStart(STAFF_NUMBER_SEQUENCE_LENGTH, "0")}`;
  }
}
