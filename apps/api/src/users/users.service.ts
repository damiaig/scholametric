import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import bcrypt from "bcrypt";
import type { User, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate, Paginated } from "../common/pagination/paginate";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

const BCRYPT_COST = 12;
// Excludes visually ambiguous characters (0/O, 1/l/I) — an admin often
// reads this aloud or copies it by hand to hand off to a new teacher.
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generateTemporaryPassword(length = 12): string {
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
  }
  return password;
}

export type SafeUser = Omit<User, "passwordHash">;

function toSafeUser(user: User): SafeUser {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  return rest;
}

export interface ListUsersParams {
  role?: UserRole;
  search?: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(query: ListUsersParams): Promise<Paginated<SafeUser>> {
    const schoolId = this.tenantContext.schoolId;
    const where = forSchool(schoolId, {
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
    });
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ firstName: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(items.map(toSafeUser), total, query.page, query.pageSize);
  }

  async create(dto: CreateUserDto): Promise<{ user: SafeUser; temporaryPassword: string }> {
    const schoolId = this.tenantContext.schoolId;
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);
    try {
      const user = await this.prisma.user.create({
        data: forSchool(schoolId, {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role,
          passwordHash,
        }),
      });
      return { user: toSafeUser(user), temporaryPassword };
    } catch (error) {
      throwIfUniqueConstraint(error, "A user with this email already exists.");
    }
  }

  async update(id: string, dto: UpdateUserDto, currentUserId: string): Promise<SafeUser> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, id);

    if (id === currentUserId && dto.role) {
      throw new BadRequestException("You cannot change your own role.");
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        status: dto.status,
      },
    });
    return toSafeUser(user);
  }

  async resetPassword(id: string): Promise<{ temporaryPassword: string }> {
    const schoolId = this.tenantContext.schoolId;
    await this.findOneOrThrow(schoolId, id);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);

    // A password reset should also end that user's other active sessions.
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { temporaryPassword };
  }

  private async findOneOrThrow(schoolId: string, id: string): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: forSchool(schoolId, { id, deletedAt: null }) });
    if (!user) {
      throw new NotFoundException("User not found.");
    }
    return user;
  }
}
