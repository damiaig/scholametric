import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import bcrypt from "bcrypt";
import { StudentStatus, User, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate, Paginated } from "../common/pagination/paginate";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import {
  groupIntoFamilies,
  nextFreeFamilyCode,
  nextSiblingDigit,
  stripTrailingDigits,
  surnameToStem,
} from "./family-coding.util";

const BCRYPT_COST = 12;
const NUMERIC_TEMP_PASSWORD_LENGTH = 6;

/**
 * Numeric-only (SPEC_V0.6.md §2.1) — deliberately NOT personnel.service.ts's
 * alphanumeric generateTemporaryPassword: portal slips go to families
 * reading digits off paper, sometimes typed by a child on a basic phone
 * keypad, so no letters/ambiguity to get wrong.
 */
function generateNumericTempPassword(length = NUMERIC_TEMP_PASSWORD_LENGTH): string {
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += (bytes[i] % 10).toString();
  }
  return password;
}

interface StudentRecord {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
}

interface GuardianLink {
  studentId: string;
  guardianId: string;
  isPrimary: boolean;
  createdAt: Date;
  guardian: { id: string; firstName: string; lastName: string };
}

export interface ProvisionedAccount {
  id: string;
  username: string;
  tempPassword: string;
  studentId?: string;
  guardianId?: string;
}

export interface ProvisionWarning {
  type: "no_guardian" | "no_primary_guardian_marked" | "child_not_covered";
  studentId?: string;
  guardianId?: string;
  familyCode?: string;
  message: string;
}

export interface ProvisionResult {
  studentsCreated: ProvisionedAccount[];
  parentsCreated: ProvisionedAccount[];
  alreadyProvisioned: { students: number; parents: number };
  warnings: ProvisionWarning[];
}

export interface PortalAccountSummary {
  id: string;
  role: UserRole;
  username: string;
  displayName: string;
  studentId: string | null;
  guardianId: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
}

export interface ReissuedAccount extends PortalAccountSummary {
  tempPassword: string;
}

export type SkippedReissueReason = "already_changed_password" | "not_provisioned";

export interface SkippedReissue {
  id: string;
  username: string | null;
  displayName: string;
  reason: SkippedReissueReason;
}

export interface BatchReissueResult {
  classArmId: string;
  reissued: ReissuedAccount[];
  skipped: SkippedReissue[];
}

// SPEC_V0.6.md §5 step 1 — provisions STUDENT/PARENT portal login accounts
// from existing Student/Guardian records. Grouping, stems, and username
// resolution are pure functions in family-coding.util.ts; this service is
// the DB orchestration around them: one transaction per family (so one bad
// family can't roll back families already provisioned in the same run —
// re-runnable), each starting with a school-scoped advisory lock so a
// second concurrent provisioning call for the same school can't race this
// one's username allocation. Families within a single call are processed
// SEQUENTIALLY (not Promise.all) so a later family in the same run sees
// usernames an earlier one just created (e.g. two brand-new unrelated
// OKAFOR families in one call: the second must see the first's freshly
// -created OKAFOR before it can correctly choose OKAFORB).
@Injectable()
export class PortalAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async provision(): Promise<ProvisionResult> {
    const schoolId = this.tenantContext.schoolId;

    const students = await this.prisma.student.findMany({
      where: forSchool(schoolId, { status: StudentStatus.ACTIVE, deletedAt: null }),
      orderBy: { admissionNumber: "asc" },
    });

    const links = await this.prisma.studentGuardian.findMany({
      where: forSchool(schoolId, {}),
      include: { guardian: true },
      orderBy: { createdAt: "asc" },
    });

    const families = groupIntoFamilies(
      students.map((s) => ({ id: s.id, admissionNumber: s.admissionNumber })),
      links.map((l) => ({ studentId: l.studentId, guardianId: l.guardianId })),
    );

    const studentById = new Map<string, StudentRecord>(students.map((s) => [s.id, s]));
    const linksByStudent = new Map<string, GuardianLink[]>();
    for (const link of links) {
      const list = linksByStudent.get(link.studentId) ?? [];
      list.push(link);
      linksByStudent.set(link.studentId, list);
    }

    const result: ProvisionResult = {
      studentsCreated: [],
      parentsCreated: [],
      alreadyProvisioned: { students: 0, parents: 0 },
      warnings: [],
    };

    for (const family of families) {
      const members = family.members.map((m) => studentById.get(m.id)!);
      await this.provisionFamily(schoolId, members, linksByStudent, result);
    }

    return result;
  }

  private async provisionFamily(
    schoolId: string,
    members: StudentRecord[],
    linksByStudent: Map<string, GuardianLink[]>,
    result: ProvisionResult,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${schoolId}:portal-accounts`}))`;

      // Deterministic anchor: lowest admissionNumber (members are already
      // sorted this way by groupIntoFamilies). A multi-member family's
      // anchor always has >=1 guardian link — that's how it got merged
      // into this family in the first place; only a true singleton (no
      // guardian at all) can have zero.
      const anchorStudent = members[0];
      const anchorLinks = linksByStudent.get(anchorStudent.id) ?? [];
      const primaryLink = anchorLinks.find((l) => l.isPrimary);
      const fallbackLink =
        !primaryLink && anchorLinks.length > 0
          ? [...anchorLinks].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
          : undefined;
      const anchorLink = primaryLink ?? fallbackLink;
      const anchorGuardian = anchorLink?.guardian ?? null;

      if (!primaryLink && fallbackLink) {
        result.warnings.push({
          type: "no_primary_guardian_marked",
          studentId: anchorStudent.id,
          guardianId: fallbackLink.guardianId,
          message: `${anchorStudent.firstName} ${anchorStudent.lastName} has no guardian marked primary — used the first-listed guardian instead.`,
        });
      }

      const existingParentAccount = anchorGuardian
        ? await tx.user.findFirst({ where: forSchool(schoolId, { guardianId: anchorGuardian.id }) })
        : null;

      let familyCode: string;
      if (existingParentAccount) {
        // Reused as-is — permanent once issued (SPEC_V0.6.md §2.2d), never
        // recomputed even if the guardian's surname is edited afterward.
        familyCode = existingParentAccount.username!;
      } else {
        const existingStudentAccount = await tx.user.findFirst({
          where: forSchool(schoolId, { studentId: { in: members.map((m) => m.id) }, role: UserRole.STUDENT }),
        });
        if (existingStudentAccount) {
          familyCode = stripTrailingDigits(existingStudentAccount.username!);
        } else {
          const stem = surnameToStem(anchorGuardian ? anchorGuardian.lastName : anchorStudent.lastName);
          const existingUsernames = await tx.user.findMany({
            where: { schoolId, username: { not: null } },
            select: { username: true },
          });
          familyCode = nextFreeFamilyCode(stem, new Set(existingUsernames.map((u) => u.username!.toUpperCase())));
        }
      }

      if (!anchorGuardian) {
        result.warnings.push({
          type: "no_guardian",
          studentId: anchorStudent.id,
          familyCode,
          message: `${anchorStudent.firstName} ${anchorStudent.lastName} has no guardian on record — no parent account was created.`,
        });
      } else if (!existingParentAccount) {
        const tempPassword = generateNumericTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);
        let parentUser: User;
        try {
          parentUser = await tx.user.create({
            data: {
              schoolId,
              role: UserRole.PARENT,
              username: familyCode,
              guardianId: anchorGuardian.id,
              firstName: anchorGuardian.firstName,
              lastName: anchorGuardian.lastName,
              passwordHash,
              mustChangePassword: true,
            },
          });
        } catch (error) {
          throwIfUniqueConstraint(error, `A portal account with username ${familyCode} already exists.`);
        }
        result.parentsCreated.push({ id: parentUser.id, username: familyCode, tempPassword, guardianId: anchorGuardian.id });
      } else {
        result.alreadyProvisioned.parents++;
      }

      // Blended-family read-scope (SPEC_V0.6 amendment): the parent
      // account's future read-scope (Step 4) is the anchor guardian's OWN
      // direct links, not "family membership" — so any member here who
      // isn't directly linked to the anchor guardian is flagged, not
      // silently included (would leak) or silently dropped (would gap).
      // Also catches accidental over-merges through a guardian shared
      // across otherwise-unrelated households.
      if (anchorGuardian) {
        for (const member of members) {
          const directlyLinked = (linksByStudent.get(member.id) ?? []).some((l) => l.guardianId === anchorGuardian.id);
          if (!directlyLinked) {
            result.warnings.push({
              type: "child_not_covered",
              studentId: member.id,
              familyCode,
              message: `${member.firstName} ${member.lastName} is grouped into the ${familyCode} family but is not linked to its guardian account — they will not appear under this parent login.`,
            });
          }
        }
      }

      for (const member of members) {
        const existingStudentUser = await tx.user.findFirst({ where: forSchool(schoolId, { studentId: member.id }) });
        if (existingStudentUser) {
          result.alreadyProvisioned.students++;
          continue;
        }

        // Re-read inside the loop: an earlier sibling processed in this
        // same iteration just inserted a username the next one must see.
        const existingUsernames = await tx.user.findMany({
          where: { schoolId, username: { not: null } },
          select: { username: true },
        });
        const digit = nextSiblingDigit(
          familyCode,
          existingUsernames.map((u) => u.username!),
        );
        const username = `${familyCode}${digit}`;

        const tempPassword = generateNumericTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);
        let studentUser: User;
        try {
          studentUser = await tx.user.create({
            data: {
              schoolId,
              role: UserRole.STUDENT,
              username,
              studentId: member.id,
              firstName: member.firstName,
              lastName: member.lastName,
              passwordHash,
              mustChangePassword: true,
            },
          });
        } catch (error) {
          throwIfUniqueConstraint(error, `A portal account with username ${username} already exists.`);
        }
        result.studentsCreated.push({ id: studentUser.id, username, tempPassword, studentId: member.id });
      }
    });
  }

  async list(query: PaginationQueryDto): Promise<Paginated<PortalAccountSummary>> {
    const schoolId = this.tenantContext.schoolId;
    const where = forSchool(schoolId, { role: { in: [UserRole.STUDENT, UserRole.PARENT] }, deletedAt: null });

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { student: true, guardian: true },
        orderBy: [{ username: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(items.map(toPortalAccountSummary), total, query.page, query.pageSize);
  }

  async findOne(id: string): Promise<PortalAccountSummary> {
    const schoolId = this.tenantContext.schoolId;
    const account = await this.prisma.user.findFirst({
      where: forSchool(schoolId, { id, role: { in: [UserRole.STUDENT, UserRole.PARENT] }, deletedAt: null }),
      include: { student: true, guardian: true },
    });
    if (!account) {
      throw new NotFoundException("Portal account not found.");
    }
    return toPortalAccountSummary(account);
  }

  // SPEC_V0.6.md §5 step 5 — temp passwords are bcrypt-hashed at rest
  // (provisionFamily above) with no plaintext ever recoverable, so
  // reprinting a slip later is only possible by generating a FRESH temp
  // password. Reuses provisioning's own generator/cost (no parallel
  // implementation) and lifts the update+revoke transaction shape from
  // personnel.service.ts's resetPassword, so a reissued account is
  // indistinguishable at login from a freshly-provisioned one.
  async reissue(id: string): Promise<ReissuedAccount> {
    const schoolId = this.tenantContext.schoolId;
    const account = await this.prisma.user.findFirst({
      where: forSchool(schoolId, { id, role: { in: [UserRole.STUDENT, UserRole.PARENT] }, deletedAt: null }),
    });
    if (!account) {
      throw new NotFoundException("Portal account not found.");
    }

    const tempPassword = generateNumericTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true },
        include: { student: true, guardian: true },
      }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);

    return { ...toPortalAccountSummary(updated), tempPassword };
  }

  // Batch = a class arm's current-session roster's own STUDENT accounts +
  // the deduplicated set of PARENT accounts directly linked (student_
  // guardians) to any of those students — a guardian shared across two
  // roster siblings is reissued/printed exactly once, not twice. Default
  // (force=false) skips any account that already changed its password
  // (mustChangePassword=false — a family actively using their login) and
  // any roster student with no portal account at all yet; both are
  // reported with a reason, never silently dropped, so an admin can't be
  // misled into thinking a batch reissue was exhaustive when it wasn't.
  async reissueForClassArm(classArmId: string, force: boolean): Promise<BatchReissueResult> {
    const schoolId = this.tenantContext.schoolId;
    const classArm = await this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: classArmId }) });
    if (!classArm) {
      throw new NotFoundException("Class arm not found.");
    }

    const session = await this.prisma.academicSession.findFirst({ where: forSchool(schoolId, { isCurrent: true }) });
    if (!session) {
      throw new BadRequestException("No current academic session configured for this school.");
    }

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: forSchool(schoolId, {
        classArmId,
        sessionId: session.id,
        student: { deletedAt: null, status: { not: StudentStatus.WITHDRAWN } },
      }),
      include: { student: true },
    });
    const rosterStudentIds = enrollments.map((e) => e.studentId);

    const studentAccounts = rosterStudentIds.length
      ? await this.prisma.user.findMany({
          where: forSchool(schoolId, { studentId: { in: rosterStudentIds }, role: UserRole.STUDENT, deletedAt: null }),
          include: { student: true, guardian: true },
        })
      : [];
    const provisionedStudentIds = new Set(studentAccounts.map((a) => a.studentId!));

    const guardianLinks = rosterStudentIds.length
      ? await this.prisma.studentGuardian.findMany({ where: forSchool(schoolId, { studentId: { in: rosterStudentIds } }) })
      : [];
    const guardianIds = [...new Set(guardianLinks.map((l) => l.guardianId))];

    const parentAccounts = guardianIds.length
      ? await this.prisma.user.findMany({
          where: forSchool(schoolId, { guardianId: { in: guardianIds }, role: UserRole.PARENT, deletedAt: null }),
          include: { student: true, guardian: true },
        })
      : [];

    const result: BatchReissueResult = { classArmId, reissued: [], skipped: [] };

    for (const enrollment of enrollments) {
      if (!provisionedStudentIds.has(enrollment.studentId)) {
        result.skipped.push({
          id: enrollment.studentId,
          username: null,
          displayName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
          reason: "not_provisioned",
        });
      }
    }

    for (const account of [...studentAccounts, ...parentAccounts]) {
      if (!force && !account.mustChangePassword) {
        const summary = toPortalAccountSummary(account);
        result.skipped.push({
          id: summary.id,
          username: summary.username,
          displayName: summary.displayName,
          reason: "already_changed_password",
        });
        continue;
      }
      result.reissued.push(await this.reissue(account.id));
    }

    return result;
  }
}

type PortalAccountWithLinks = User & {
  student: { firstName: string; lastName: string } | null;
  guardian: { firstName: string; lastName: string } | null;
};

// Display name reads live through the linked Student/Guardian, matching
// this codebase's existing convention for join-derived display names (e.g.
// class-arms.service.ts's teacherFirstName reads live through
// classTeacherAssignment.teacherUser, never a copy) — so a later name
// correction on the Student/Guardian record shows up here without an
// update to this row. user.firstName/lastName are populated once at
// creation (User's NOT NULL columns require some value) but are not the
// read source for portal accounts.
function toPortalAccountSummary(user: PortalAccountWithLinks): PortalAccountSummary {
  const name = user.student ?? user.guardian;
  return {
    id: user.id,
    role: user.role,
    username: user.username!,
    displayName: name ? `${name.firstName} ${name.lastName}` : `${user.firstName} ${user.lastName}`,
    studentId: user.studentId,
    guardianId: user.guardianId,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}
