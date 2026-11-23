import { randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";
import { Prisma, type RefreshToken, type School, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { runLockedTransaction } from "../common/prisma/locked-transaction";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ACCESS_TOKEN_TTL, BCRYPT_COST, REFRESH_TOKEN_TTL_MS } from "./auth.constants";
import { generateOpaqueToken, hashToken } from "./refresh-token.util";
import type { AccessTokenPayload } from "./types/jwt-payload.type";

// Precomputed once at boot so every login pays the same bcrypt cost whether
// or not the school/user actually exists — no timing side-channel (CLAUDE.md
// §4/§5 spirit: unknown-account and wrong-password responses must be
// indistinguishable). Never a real credential.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("scholametric-timing-safety-dummy", BCRYPT_COST);

const GENERIC_LOGIN_ERROR = "Invalid email/username, password, or school.";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const school = await this.prisma.school.findUnique({ where: { slug: dto.schoolSlug } });
    // v0.6 step 2: one identifier, resolved against either email (staff) or
    // username (STUDENT/PARENT portal accounts, v0.6 step 1) within the
    // resolved school. Unambiguous by construction — email always contains
    // "@" (enforced at staff creation), a provisioned username never does
    // (family-coding.util.ts) — so this OR can never match two different
    // rows for one identifier. schoolId comes from the resolved school, not
    // the identifier, so there is no cross-tenant lookup: a real
    // username+password from another school simply never resolves here,
    // falling through to the same generic failure below as any other wrong
    // combination — not a distinguishable 404 (that would leak which part
    // of the login was wrong, re-opening the enumeration side-channel this
    // dummy-hash timing safety already closes).
    const user = school
      ? await this.prisma.user.findFirst({
          where: {
            schoolId: school.id,
            OR: [{ email: dto.identifier }, { username: dto.identifier }],
            status: "ACTIVE",
            deletedAt: null,
          },
        })
      : null;

    const passwordValid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!school || !user || !passwordValid) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const tokens = await this.issueTokenPair(user.id, school.id, user.role, user.mustChangePassword);
    return { ...tokens, user: this.toUserSummary(user, school) };
  }

  // v0.8.5 step 2 (SPEC_V0.8.5.md §5) — the reuse-detection rework. Plain
  // expiry is checked FIRST and separately: a token that simply timed out
  // from disuse is not suspicious (nothing to revoke), and folding it into
  // the sequence-comparison below would be a genuinely awkward third case
  // (an expired-but-never-rotated token has no successor at all, matching
  // neither branch of the invariant cleanly).
  //
  // The atomic rotation (`updateMany` conditioned on `revokedAt: null`) is
  // Postgres's own row lock doing the serialization: of any number of
  // concurrent callers presenting the SAME live token, exactly one's
  // update affects a row; every other one affects zero and falls through
  // to the reuse-classification below. The winner's revoke-parent +
  // create-child happen inside ONE transaction — this is load-bearing,
  // not stylistic: a loser's blocked `updateMany` only unblocks once the
  // winner's entire transaction has committed, so by the time the loser
  // observes `count: 0`, the winner's child row is GUARANTEED visible.
  // Without that guarantee, a loser could observe "parent revoked, child
  // not yet inserted" and misclassify a benign race as reuse.
  //
  // The discriminator itself, once a presented token turns out to be
  // already-revoked (whether it lost the race just now, or was already
  // dead from an earlier call): compare the family's current maximum
  // sequence to this token's own sequence + 1.
  //   - Equal: the ONLY thing that has ever superseded this token is its
  //     immediate (and only) child, and that child has itself never been
  //     rotated. A genuine double-submit race can only ever produce one
  //     successor — there is no way for it to advance the chain by more
  //     than one generation. -> 401, family untouched; the winner's
  //     child stays valid.
  //   - Greater: the chain has moved two or more generations past this
  //     token. The legitimate holder of the immediate child would have
  //     used IT to get the next one rather than re-presenting this
  //     ancestor — the only way an ancestor resurfaces once the chain is
  //     two-plus steps ahead is a replayed/leaked copy. -> revoke the
  //     whole family (SPEC_V0.8.5.md §5's genuine-reuse branch).
  async refresh(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const row = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });
    if (!row) {
      throw new UnauthorizedException("Unauthorized");
    }

    if (row.expiresAt < new Date()) {
      throw new UnauthorizedException("Unauthorized");
    }

    const user = await this.prisma.user.findFirst({
      where: { id: row.userId, status: "ACTIVE", deletedAt: null },
    });
    if (!user) {
      throw new UnauthorizedException("Unauthorized");
    }

    const rotated = await runLockedTransaction(this.prisma, async (tx) => {
      const result = await tx.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count === 0) {
        return null;
      }
      return this.createFamilyMember(tx, user.id, row.familyId, row.familySequence + 1);
    });

    if (rotated) {
      const accessToken = await this.signAccessToken(user.id, user.schoolId, user.role, user.mustChangePassword);
      return { accessToken, refreshToken: rotated.rawToken };
    }

    await this.handleAlreadyRevoked(row);
    throw new UnauthorizedException("Unauthorized");
  }

  // Shared by both paths that land here: a request that found the token
  // ALREADY revoked at lookup time, and a request that lost the atomic
  // race above (count: 0) — both converge on identical state (a revoked
  // row whose family may or may not have moved further), so both get the
  // same classification logic.
  private async handleAlreadyRevoked(row: RefreshToken): Promise<void> {
    const { _max } = await this.prisma.refreshToken.aggregate({
      where: { familyId: row.familyId },
      _max: { familySequence: true },
    });
    if (_max.familySequence === row.familySequence + 1) {
      return; // benign race-loser / retry — the family is untouched
    }
    // Genuine reuse: this token has been superseded by two or more
    // generations. Revoke-scoped to the family, never userId-wide — a
    // theft reaction on one device must never affect another.
    await this.prisma.refreshToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // v0.8.5 step 2 — generalizes Step 1's per-token revoke to the real
  // family: find the presented token (scoped by userId, same as Step 1)
  // to learn which family it belongs to, then revoke every still-active
  // row in THAT family only. No row found is still a harmless no-op
  // (Step 1's idempotent-logout behavior, unchanged).
  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const row = await this.prisma.refreshToken.findFirst({ where: { userId, tokenHash } });
    if (!row) {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
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
      mustChangePassword: user.mustChangePassword,
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

  // SPEC_V0.3.md §2: verifies current password, sets the new one, clears the
  // flag. Deliberately does NOT revoke other refresh tokens (resolution 1 —
  // no session/family concept exists to distinguish "this session" from
  // "others"; see docs/DECISIONS.md). DOES reissue a fresh token pair for
  // the caller, though: otherwise their own still-valid access token would
  // keep the stale mustChangePassword:true claim and PasswordChangeRequiredGuard
  // would keep blocking them for up to the token's remaining lifetime even
  // after a successful change.
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) {
      throw new UnauthorizedException("Unauthorized");
    }

    const currentValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!currentValid) {
      throw new UnauthorizedException("Current password is incorrect.");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_COST);
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      // No password material logged — deliberately not request.body via the
      // standard @Audit()/AuditInterceptor (see docs/DECISIONS.md).
      this.prisma.auditLog.create({
        data: {
          schoolId: user.schoolId,
          actorUserId: userId,
          action: "user.changePassword",
          entityType: "user",
          entityId: userId,
          metadata: {},
        },
      }),
    ]);

    return this.issueTokenPair(updated.id, updated.schoolId, updated.role, updated.mustChangePassword);
  }

  // v0.8.5 step 2 — mints a BRAND NEW family (a fresh chain root, sequence
  // 0). Used by login and change-password, both of which aren't presenting
  // an existing refresh token to continue a chain FROM — change-password
  // deliberately mints a new family rather than extending whatever family
  // the caller's current session happens to belong to (there's nothing to
  // continue from at this endpoint), same as login. It also does NOT
  // revoke the caller's other existing families — that's a separate,
  // not-yet-decided policy question, out of scope here.
  private async issueTokenPair(userId: string, schoolId: string, role: User["role"], mustChangePassword: boolean) {
    const accessToken = await this.signAccessToken(userId, schoolId, role, mustChangePassword);
    const { rawToken } = await this.createFamilyMember(this.prisma, userId, randomUUID(), 0);
    return { accessToken, refreshToken: rawToken };
  }

  private async signAccessToken(userId: string, schoolId: string, role: User["role"], mustChangePassword: boolean): Promise<string> {
    const payload: AccessTokenPayload = { sub: userId, schoolId, role, mustChangePassword };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  // Shared by issueTokenPair (a fresh family, sequence 0) and refresh's
  // own rotation (same family, sequence = parent + 1). Accepts either the
  // plain PrismaService or a $transaction callback's tx client — refresh
  // calls this from INSIDE a transaction (see the non-negotiable
  // correctness note on refresh() above); issueTokenPair doesn't need one
  // (a single insert is already atomic on its own).
  private async createFamilyMember(
    client: PrismaService | Prisma.TransactionClient,
    userId: string,
    familyId: string,
    familySequence: number,
  ): Promise<{ rawToken: string }> {
    const rawToken = generateOpaqueToken();
    await client.refreshToken.create({
      data: {
        userId,
        familyId,
        familySequence,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return { rawToken };
  }

  private toUserSummary(user: User, school: School) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      schoolId: school.id,
      school: { id: school.id, name: school.name, slug: school.slug },
    };
  }
}
