import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ResultStatus, type Term, type TermUnlock } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { paginate, Paginated } from "../common/pagination/paginate";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { termLockKey } from "../grades/lock-keys";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateTermDto } from "./dto/create-term.dto";
import { UnlockTermDto } from "./dto/unlock-term.dto";
import { RelockTermDto } from "./dto/relock-term.dto";

export interface UnpublishedBreakdownRow {
  classArmId: string;
  subjectId: string;
  draftCount: number;
  pendingApprovalCount: number;
}

export interface CloseTermResponse extends Term {
  unpublishedCount: number;
  unpublished: UnpublishedBreakdownRow[];
}

@Injectable()
export class TermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async findAll(sessionId: string, page: number, pageSize: number): Promise<Paginated<Term>> {
    const where = forSchool(this.tenantContext.schoolId, { sessionId });
    const [items, total] = await this.prisma.$transaction([
      this.prisma.term.findMany({
        where,
        orderBy: [{ startsOn: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.term.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  async create(dto: CreateTermDto): Promise<Term> {
    const schoolId = this.tenantContext.schoolId;
    const session = await this.prisma.academicSession.findFirst({
      where: forSchool(schoolId, { id: dto.sessionId }),
    });
    if (!session) {
      throw new NotFoundException("Session not found.");
    }

    try {
      return await this.prisma.term.create({
        data: forSchool(schoolId, {
          sessionId: dto.sessionId,
          name: dto.name,
          startsOn: new Date(dto.startsOn),
          endsOn: new Date(dto.endsOn),
        }),
      });
    } catch (error) {
      throwIfUniqueConstraint(error, "This term already exists for the session.");
    }
  }

  async activate(id: string): Promise<Term> {
    const schoolId = this.tenantContext.schoolId;
    const term = await this.prisma.term.findFirst({ where: forSchool(schoolId, { id }) });
    if (!term) {
      throw new NotFoundException("Term not found.");
    }

    // Same deactivate-then-activate ordering as sessions, scoped to the
    // partial unique index on (session_id) WHERE is_current for terms.
    const [, activated] = await this.prisma.$transaction([
      this.prisma.term.updateMany({
        where: forSchool(schoolId, { sessionId: term.sessionId, isCurrent: true, NOT: { id } }),
        data: { isCurrent: false },
      }),
      this.prisma.term.update({ where: { id }, data: { isCurrent: true } }),
    ]);
    return activated;
  }

  // A deliberate principal/proprietor act (SPEC_V0.5.md §2.3) — flips the
  // term read-only. Q4: warn-but-allow — a term can close with unpublished
  // results left behind; this returns what's still unpublished (grouped by
  // class arm + subject, ids only — step 5 already has its own classes/
  // subjects lists to resolve names against) rather than blocking. Not
  // idempotent — re-closing an already-closed term 409s rather than
  // silently overwriting closed_at/closed_by, which would destroy the
  // original close record (unlike publish()'s legitimate idempotent
  // re-confirm, there's no "reconfirm a close" semantic).
  async close(id: string, user: AuthenticatedUser): Promise<CloseTermResponse> {
    const schoolId = this.tenantContext.schoolId;
    const term = await this.prisma.term.findFirst({ where: forSchool(schoolId, { id }) });
    if (!term) {
      throw new NotFoundException("Term not found.");
    }
    if (term.closedAt !== null) {
      throw new ConflictException("This term is already closed.");
    }

    const lockKey = termLockKey(schoolId, id);
    return this.prisma.$transaction(
      async (tx) => {
        // Same term-level lock saveGrid() acquires first — serializes this
        // close against a concurrent saveGrid so neither can read a stale
        // closed_at (SPEC_V0.5.md §2.3, step 3).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const fresh = await tx.term.findUniqueOrThrow({ where: { id } });
        if (fresh.closedAt !== null) {
          throw new ConflictException("This term is already closed.");
        }

        const closed = await tx.term.update({ where: { id }, data: { closedAt: new Date(), closedBy: user.userId } });

        const unpublishedRows = await tx.termSubjectResult.findMany({
          where: { schoolId, termId: id, sessionId: term.sessionId, status: { not: ResultStatus.PUBLISHED } },
        });
        const grouped = new Map<string, UnpublishedBreakdownRow>();
        for (const row of unpublishedRows) {
          const key = `${row.classArmId}:${row.subjectId}`;
          const bucket = grouped.get(key) ?? { classArmId: row.classArmId, subjectId: row.subjectId, draftCount: 0, pendingApprovalCount: 0 };
          if (row.status === ResultStatus.DRAFT) {
            bucket.draftCount++;
          } else {
            bucket.pendingApprovalCount++;
          }
          grouped.set(key, bucket);
        }

        return { ...closed, unpublishedCount: unpublishedRows.length, unpublished: [...grouped.values()] };
      },
      { timeout: 15000 },
    );
  }

  // Principal/proprietor clearance to edit ONE class-arm+subject within an
  // otherwise-closed term (SPEC_V0.5.md §2.3/Q3). "Currently unlocked" =
  // the partial-unique row (relocked_at IS NULL) — an index lookup, never
  // a scan, regardless of how many resolved (relocked) unlocks accumulate.
  async unlock(id: string, dto: UnlockTermDto, user: AuthenticatedUser): Promise<TermUnlock> {
    const schoolId = this.tenantContext.schoolId;
    const [term, classArm, subject] = await Promise.all([
      this.prisma.term.findFirst({ where: forSchool(schoolId, { id }) }),
      this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: dto.classArmId }) }),
      this.prisma.subject.findFirst({ where: forSchool(schoolId, { id: dto.subjectId, deletedAt: null }) }),
    ]);
    if (!term) throw new NotFoundException("Term not found.");
    if (!classArm) throw new NotFoundException("Class arm not found.");
    if (!subject) throw new NotFoundException("Subject not found.");

    const lockKey = termLockKey(schoolId, id);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const fresh = await tx.term.findUniqueOrThrow({ where: { id } });
        if (fresh.closedAt === null) {
          throw new ConflictException("This term is not closed — no unlock needed.");
        }

        const existingActive = await tx.termUnlock.findFirst({
          where: { termId: id, classArmId: dto.classArmId, subjectId: dto.subjectId, relockedAt: null },
        });
        if (existingActive) {
          throw new ConflictException("This class and subject are already unlocked for this term.");
        }

        return tx.termUnlock.create({
          data: {
            schoolId,
            termId: id,
            classArmId: dto.classArmId,
            subjectId: dto.subjectId,
            reason: dto.reason,
            unlockedBy: user.userId,
          },
        });
      },
      { timeout: 10000 },
    );
  }

  // Manual re-lock (SPEC_V0.5.md §2.3/Q3) — closes the currently-active
  // unlock episode for this class-arm+subject; there is no auto-expiry.
  async relock(id: string, dto: RelockTermDto, user: AuthenticatedUser): Promise<TermUnlock> {
    const schoolId = this.tenantContext.schoolId;
    const [term, classArm, subject] = await Promise.all([
      this.prisma.term.findFirst({ where: forSchool(schoolId, { id }) }),
      this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: dto.classArmId }) }),
      this.prisma.subject.findFirst({ where: forSchool(schoolId, { id: dto.subjectId, deletedAt: null }) }),
    ]);
    if (!term) throw new NotFoundException("Term not found.");
    if (!classArm) throw new NotFoundException("Class arm not found.");
    if (!subject) throw new NotFoundException("Subject not found.");

    const lockKey = termLockKey(schoolId, id);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const active = await tx.termUnlock.findFirst({
          where: { termId: id, classArmId: dto.classArmId, subjectId: dto.subjectId, relockedAt: null },
        });
        if (!active) {
          throw new ConflictException("No active unlock to relock for this class and subject.");
        }

        return tx.termUnlock.update({ where: { id: active.id }, data: { relockedAt: new Date(), relockedBy: user.userId } });
      },
      { timeout: 10000 },
    );
  }
}
