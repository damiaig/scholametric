import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";
import type { School, User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { ACCESS_TOKEN_TTL, BCRYPT_COST, REFRESH_TOKEN_TTL_MS } from "./auth.constants";
import { generateOpaqueToken, hashToken } from "./refresh-token.util";
import type { AccessTokenPayload } from "./types/jwt-payload.type";

// Precomputed once at boot so every login pays the same bcrypt cost whether
// or not the school/user actually exists — no timing side-channel (CLAUDE.md
// §4/§5 spirit: unknown-account and wrong-password responses must be
// indistinguishable). Never a real credential.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("scholametric-timing-safety-dummy", BCRYPT_COST);

const GENERIC_LOGIN_ERROR = "Invalid email, password, or school.";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const school = await this.prisma.school.findUnique({ where: { slug: dto.schoolSlug } });
    const user = school
      ? await this.prisma.user.findFirst({
          where: { schoolId: school.id, email: dto.email, status: "ACTIVE", deletedAt: null },
        })
      : null;

    const passwordValid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!school || !user || !passwordValid) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const tokens = await this.issueTokenPair(user.id, school.id, user.role);
    return { ...tokens, user: this.toUserSummary(user, school) };
  }

  async refresh(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const row = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });
    if (!row) {
      throw new UnauthorizedException("Unauthorized");
    }

    if (row.revokedAt || row.expiresAt < new Date()) {
      // Reuse of an already-revoked (or expired) token: no per-chain
      // family_id column exists (schema changes out of scope), so "family"
      // is every refresh_tokens row for this user — nuke them all.
      await this.prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Unauthorized");
    }

    const user = await this.prisma.user.findFirst({
      where: { id: row.userId, status: "ACTIVE", deletedAt: null },
    });
    if (!user) {
      throw new UnauthorizedException("Unauthorized");
    }

    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return this.issueTokenPair(user.id, user.schoolId, user.role);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { school: true },
    });
    if (!user) {
      throw new UnauthorizedException("Unauthorized");
    }
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      school: {
        id: user.school.id,
        name: user.school.name,
        slug: user.school.slug,
        type: user.school.type,
        status: user.school.status,
        address: user.school.address,
        phone: user.school.phone,
        email: user.school.email,
      },
    };
  }

  private async issueTokenPair(userId: string, schoolId: string, role: User["role"]) {
    const payload: AccessTokenPayload = { sub: userId, schoolId, role };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const refreshToken = generateOpaqueToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }

  private toUserSummary(user: User, school: School) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      schoolId: school.id,
      school: { id: school.id, name: school.name, slug: school.slug },
    };
  }
}
