import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ResultStatus, StudentStatus, UserRole, type AssessmentComponent, type Term, type TermSubjectResult } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import {
  computeSubjectTotal,
  computeSubjectStatus,
  computeOverallAverage,
  computeOverallStatus,
  computeStandardCompetitionRanking,
  resolveGradeBand,
  resolveFinalGrade,
  type ComponentInput,
  type ComponentScoreInput,
  type GradeBoundaryInput,
} from "../grades/grade-computation";
import { GetGradesGridQueryDto } from "./dto/get-grades-grid-query.dto";
import { SaveGradesGridDto } from "./dto/save-grades-grid.dto";
import { RecomputeGradesDto } from "./dto/recompute-grades.dto";
import { PublishGradesDto } from "./dto/publish-grades.dto";
import { UnpublishGradesDto } from "./dto/unpublish-grades.dto";
import { OverrideGradeDto } from "./dto/override-grade.dto";

export interface GradesGridRow {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  rawScore: number | null;
  // The student's SUBJECT-level status (term_subject_result), not
  // component-level — independent of which component this grid is
  // currently viewing. A student with no term_subject_result row yet
  // (nothing scored in this subject at all) reads as DRAFT, matching the
  // semantics of a subject that's never been touched. Lets the UI render
  // a PUBLISHED row read-only from load, not reactively on the first 409
  // (SPEC_V0.4.md step-4 resolution — status can genuinely be mixed
  // across one grid's roster, e.g. stragglers still DRAFT after the rest
  // of the class published, so this can't be a single grid-wide flag).
  status: ResultStatus;
}

export interface GradesGridResponse {
  classArmId: string;
  subjectId: string;
  componentId: string;
  termId: string;
  maxScore: number;
  requiresApproval: boolean;
  rows: GradesGridRow[];
}

export interface SavedGridRow {
  studentId: string;
  rawScore: number | null;
  totalScore: number;
  autoGrade: string | null;
  finalGrade: string | null;
  status: ResultStatus;
}

export interface SaveGradesGridResponse {
  classArmId: string;
  subjectId: string;
  componentId: string;
  termId: string;
  savedCount: number;
  rows: SavedGridRow[];
}

interface RecomputeContext {
  schoolId: string;
  subjectId: string;
  termId: string;
  sessionId: string;
  classArmId: string;
}

interface RecomputedRow {
  studentId: string;
  totalScore: number;
  autoGrade: string | null;
  finalGrade: string | null;
  status: ResultStatus;
}

export interface SubjectPositionRow {
  studentId: string;
  totalScore: number;
  finalGrade: string | null;
  subjectPosition: number;
}

export interface PublishResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  publishedCount: number;
  subjectPositions: SubjectPositionRow[];
  overallPublishedCount: number;
}

export interface UnpublishResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  unpublishedCount: number;
  overallRevertedCount: number;
}

export interface OverrideResponse {
  id: string;
  studentId: string;
  subjectId: string;
  termId: string;
  overrideGrade: string | null;
  autoGrade: string | null;
  finalGrade: string | null;
  status: ResultStatus;
}

interface OverallRecomputeResult {
  publishedCount: number;
  revertedCount: number;
}

@Injectable()
export class GradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async getGrid(query: GetGradesGridQueryDto, user: AuthenticatedUser): Promise<GradesGridResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term, component } = await this.resolveTenantScopeWithComponent(schoolId, query);
    await this.assertTeacherAssignment(schoolId, user, query.subjectId, query.classArmId, term.sessionId);

    const students = await this.getRoster(schoolId, query.classArmId, term.sessionId);
    const [scores, subjectResults] = await Promise.all([
      this.prisma.studentScore.findMany({
        where: {
          schoolId,
          subjectId: query.subjectId,
          componentId: query.componentId,
          termId: query.termId,
          sessionId: term.sessionId,
        },
      }),
      this.prisma.termSubjectResult.findMany({
        where: { schoolId, subjectId: query.subjectId, termId: query.termId, sessionId: term.sessionId },
      }),
    ]);
    const rawByStudent = new Map(scores.map((s) => [s.studentId, s.rawScore === null ? null : Number(s.rawScore)]));
    const statusByStudent = new Map(subjectResults.map((r) => [r.studentId, r.status]));

    return {
      classArmId: query.classArmId,
      subjectId: query.subjectId,
      componentId: query.componentId,
      termId: query.termId,
      maxScore: component.maxScore,
      requiresApproval: component.requiresApproval,
      rows: students.map((s) => ({
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        admissionNumber: s.admissionNumber,
        rawScore: rawByStudent.get(s.id) ?? null,
        status: statusByStudent.get(s.id) ?? ResultStatus.DRAFT,
      })),
    };
  }

  // Bulk upsert, atomic per request (SPEC_V0.4.md §2): every score is
  // validated against the roster and this component's actual max_score
  // BEFORE any write; a single bad entry rejects the whole batch. Re-
  // sending an identical payload is safe (idempotent) — student_scores'
  // existing (studentId, subjectId, componentId, termId, sessionId)
  // unique is the upsert key, so a retry just re-writes the same value.
  async saveGrid(dto: SaveGradesGridDto, user: AuthenticatedUser): Promise<SaveGradesGridResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term, component } = await this.resolveTenantScopeWithComponent(schoolId, dto);
    await this.assertTeacherAssignment(schoolId, user, dto.subjectId, dto.classArmId, term.sessionId);

    const students = await this.getRoster(schoolId, dto.classArmId, term.sessionId);
    const rosterIds = new Set(students.map((s) => s.id));

    for (const item of dto.scores) {
      if (!rosterIds.has(item.studentId)) {
        throw new BadRequestException(`Student ${item.studentId} is not enrolled in this class arm.`);
      }
      if (item.rawScore !== null && item.rawScore !== undefined) {
        if (item.rawScore < 0 || item.rawScore > component.maxScore) {
          throw new BadRequestException(
            `rawScore for student ${item.studentId} must be between 0 and ${component.maxScore} for this component.`,
          );
        }
      }
    }

    const affectedStudentIds = [...new Set(dto.scores.map((s) => s.studentId))];
    const lockKey = this.subjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);

    return this.prisma.$transaction(
      async (tx) => {
        // Serializes concurrent grid saves for the same subject+class+term
        // (SPEC_V0.4.md §5) — without this, two overlapping saves could
        // both read student_scores before either commits and produce a
        // lost update on the derived total_score. Same discipline as
        // StudentsService's admission-number advisory lock.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const existingResults = await tx.termSubjectResult.findMany({
          where: {
            studentId: { in: affectedStudentIds },
            subjectId: dto.subjectId,
            termId: dto.termId,
            sessionId: term.sessionId,
          },
        });
        const lockedStudentIds = existingResults.filter((r) => r.status === ResultStatus.PUBLISHED).map((r) => r.studentId);
        if (lockedStudentIds.length > 0) {
          throw this.publishedLockException("save scores", lockedStudentIds);
        }

        await Promise.all(
          dto.scores.map((item) => {
            const rawScore = item.rawScore ?? null;
            return tx.studentScore.upsert({
              where: {
                studentId_subjectId_componentId_termId_sessionId: {
                  studentId: item.studentId,
                  subjectId: dto.subjectId,
                  componentId: dto.componentId,
                  termId: dto.termId,
                  sessionId: term.sessionId,
                },
              },
              update: { rawScore, enteredBy: user.userId, enteredAt: new Date() },
              create: {
                schoolId,
                studentId: item.studentId,
                subjectId: dto.subjectId,
                componentId: dto.componentId,
                sessionId: term.sessionId,
                termId: dto.termId,
                classArmId: dto.classArmId,
                rawScore,
                enteredBy: user.userId,
                enteredAt: new Date(),
              },
            });
          }),
        );

        const recomputed = await this.recomputeStudents(
          tx,
          { schoolId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId, classArmId: dto.classArmId },
          affectedStudentIds,
        );

        // One row for the whole bulk save, not one per score — matches the
        // PUT /assessment-components / PUT /grade-boundaries precedent
        // (@Audit()/AuditInterceptor only reads response.id, which doesn't
        // fit an array-bodied bulk endpoint).
        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "grades.saveGrid",
            entityType: "grades",
            entityId: dto.classArmId,
            metadata: {
              subjectId: dto.subjectId,
              componentId: dto.componentId,
              termId: dto.termId,
              scoreCount: dto.scores.length,
            },
          },
        });

        const rawByStudent = new Map(dto.scores.map((s) => [s.studentId, s.rawScore ?? null]));
        return {
          classArmId: dto.classArmId,
          subjectId: dto.subjectId,
          componentId: dto.componentId,
          termId: dto.termId,
          savedCount: dto.scores.length,
          rows: recomputed.map((r) => ({
            studentId: r.studentId,
            rawScore: rawByStudent.get(r.studentId) ?? null,
            totalScore: r.totalScore,
            autoGrade: r.autoGrade,
            finalGrade: r.finalGrade,
            status: r.status,
          })),
        };
      },
      { timeout: 15000 }, // generous ceiling for a ~150-row roster save, not a raised default for every transaction
    );
  }

  // Admin-only manual re-trigger (SPEC_V0.4.md §2) — re-derives
  // term_subject_results for a whole class arm + subject + term from
  // whatever student_scores currently exist, e.g. after a roster fix.
  // No new computation logic: same recomputeStudents() PUT /grades/grid
  // already uses.
  async recompute(dto: RecomputeGradesDto): Promise<{ recomputedCount: number }> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await this.resolveTenantScopeSubjectOnly(schoolId, dto);

    const students = await this.getRoster(schoolId, dto.classArmId, term.sessionId);
    const studentIds = students.map((s) => s.id);
    if (studentIds.length === 0) {
      return { recomputedCount: 0 };
    }

    const lockKey = this.subjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const existingResults = await tx.termSubjectResult.findMany({
          where: { studentId: { in: studentIds }, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId },
        });
        const lockedStudentIds = existingResults.filter((r) => r.status === ResultStatus.PUBLISHED).map((r) => r.studentId);
        if (lockedStudentIds.length > 0) {
          throw this.publishedLockException("recompute", lockedStudentIds);
        }

        const recomputed = await this.recomputeStudents(
          tx,
          { schoolId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId, classArmId: dto.classArmId },
          studentIds,
        );
        return { recomputedCount: recomputed.length };
      },
      { timeout: 15000 },
    );
  }

  // Transitions a subject's PENDING_APPROVAL results to PUBLISHED and
  // computes subject_position (SPEC_V0.4.md §2/§1). Re-ranks the ENTIRE
  // currently-published set for this subject/class/term, not just the
  // newly-transitioning rows — publishing can legitimately happen more
  // than once as stragglers' exam scores land, and a second call must
  // produce positions consistent with the first batch, not a scale
  // disconnected from it. Rejects (409) only when there is truly nothing
  // to do — no rows pending AND none already published — so a director's
  // misclick against an untouched subject gets a clear answer rather than
  // a silent no-op; re-publishing an already-fully-published subject is a
  // legitimate idempotent 200 (nothing new transitions, positions
  // reconfirmed).
  async publish(dto: PublishGradesDto, user: AuthenticatedUser): Promise<PublishResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await this.resolveTenantScopeSubjectOnly(schoolId, dto);

    const subjectLockKey = this.subjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);
    const classArmLockKey = this.classArmLockKey(schoolId, dto.classArmId, dto.termId);

    return this.prisma.$transaction(
      async (tx) => {
        // Subject-level lock first (same key saveGrid/recompute/override
        // use) — blocks a concurrent score save on this exact grid from
        // racing the publish. Always acquired before the broader
        // class-arm lock below, never the reverse, so no caller can
        // deadlock against another (SPEC_V0.4.md §5 resolution).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjectLockKey}))`;

        const existing = await tx.termSubjectResult.findMany({
          where: { schoolId, classArmId: dto.classArmId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId },
        });
        const toPublish = existing.filter((r) => r.status === ResultStatus.PENDING_APPROVAL);
        const alreadyPublished = existing.filter((r) => r.status === ResultStatus.PUBLISHED);

        if (toPublish.length === 0 && alreadyPublished.length === 0) {
          const draftCount = existing.filter((r) => r.status === ResultStatus.DRAFT).length;
          throw new ConflictException(
            `Nothing to publish for this subject: ${
              draftCount > 0
                ? `${draftCount} student(s) still awaiting an approval-required (exam) score`
                : "no scores have been entered yet"
            }.`,
          );
        }

        const now = new Date();
        await Promise.all(
          toPublish.map((row) =>
            tx.termSubjectResult.update({
              where: { id: row.id },
              data: { status: ResultStatus.PUBLISHED, publishedAt: now },
            }),
          ),
        );

        const published: TermSubjectResult[] = [
          ...toPublish.map((row) => ({ ...row, status: ResultStatus.PUBLISHED, publishedAt: now })),
          ...alreadyPublished,
        ];
        const ranking = computeStandardCompetitionRanking(published, (row) => Number(row.totalScore));
        await Promise.all(
          ranking.map(({ item, position }) =>
            tx.termSubjectResult.update({ where: { id: item.id }, data: { subjectPosition: position } }),
          ),
        );

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "grades.publish",
            entityType: "grades",
            entityId: dto.classArmId,
            metadata: { subjectId: dto.subjectId, termId: dto.termId, publishedCount: toPublish.length },
          },
        });

        // Broader lock for the cross-subject overall recompute — a
        // second, concurrent publish() for a DIFFERENT subject of this
        // same class arm/term would otherwise be able to read this
        // student's term_subject_results before this transaction commits,
        // independently concluding "not all published yet," and neither
        // call would ever correctly flip the student's overall to
        // PUBLISHED (a genuine lost update, not just a display quirk).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${classArmLockKey}))`;
        const overall = await this.recomputeOverallForClassArm(tx, {
          schoolId,
          classArmId: dto.classArmId,
          termId: dto.termId,
          sessionId: term.sessionId,
        });

        return {
          classArmId: dto.classArmId,
          subjectId: dto.subjectId,
          termId: dto.termId,
          publishedCount: toPublish.length,
          subjectPositions: ranking.map(({ item, position }) => ({
            studentId: item.studentId,
            totalScore: Number(item.totalScore),
            finalGrade: item.finalGrade,
            subjectPosition: position,
          })),
          overallPublishedCount: overall.publishedCount,
        };
      },
      { timeout: 20000 }, // two locks + a class-arm-wide read/write phase — generous safety valve, not the e2e proof's ceiling
    );
  }

  // Reverts a subject's PUBLISHED results — deterministically back to
  // PENDING_APPROVAL, since score writes are blocked while PUBLISHED, so
  // nothing could have changed underneath (reuses recomputeStudents rather
  // than hardcoding the status literal, so this stays correct even if that
  // invariant is ever violated). Clears subject_position/published_at as
  // part of the same recompute. PROPRIETOR only (owner authority). 409 if
  // nothing is currently published for this subject — symmetric with
  // publish()'s "nothing to do" rejection.
  async unpublish(dto: UnpublishGradesDto, user: AuthenticatedUser): Promise<UnpublishResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await this.resolveTenantScopeSubjectOnly(schoolId, dto);

    const subjectLockKey = this.subjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);
    const classArmLockKey = this.classArmLockKey(schoolId, dto.classArmId, dto.termId);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjectLockKey}))`;

        const published = await tx.termSubjectResult.findMany({
          where: {
            schoolId,
            classArmId: dto.classArmId,
            subjectId: dto.subjectId,
            termId: dto.termId,
            sessionId: term.sessionId,
            status: ResultStatus.PUBLISHED,
          },
        });
        if (published.length === 0) {
          throw new ConflictException("Nothing to unpublish: this subject has no published results.");
        }

        const studentIds = published.map((row) => row.studentId);
        await this.recomputeStudents(
          tx,
          { schoolId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId, classArmId: dto.classArmId },
          studentIds,
        );

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "grades.unpublish",
            entityType: "grades",
            entityId: dto.classArmId,
            metadata: { subjectId: dto.subjectId, termId: dto.termId, unpublishedCount: studentIds.length },
          },
        });

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${classArmLockKey}))`;
        const overall = await this.recomputeOverallForClassArm(tx, {
          schoolId,
          classArmId: dto.classArmId,
          termId: dto.termId,
          sessionId: term.sessionId,
        });

        return {
          classArmId: dto.classArmId,
          subjectId: dto.subjectId,
          termId: dto.termId,
          unpublishedCount: studentIds.length,
          overallRevertedCount: overall.revertedCount,
        };
      },
      { timeout: 20000 },
    );
  }

  // Sets/clears override_grade; final_grade is recomputed from it.
  // total_score and subject_position are NEVER touched — override is a
  // display-layer correction, not a ranking input (SPEC_V0.4.md §1: rank
  // on total_score only). PROPRIETOR only once PUBLISHED. Blocked entirely
  // while DRAFT (step-3 resolution): the total isn't final pre-approval,
  // so a stored override would silently strand itself on an incomplete
  // number — recomputeStudents enforces the same invariant on the way
  // back down (PENDING_APPROVAL -> DRAFT via a cleared exam score nulls
  // any stored override, not just leaves it stale).
  async override(dto: OverrideGradeDto, user: AuthenticatedUser): Promise<OverrideResponse> {
    const schoolId = this.tenantContext.schoolId;
    const row = await this.prisma.termSubjectResult.findFirst({ where: { id: dto.termSubjectResultId, schoolId } });
    if (!row) {
      throw new NotFoundException("Result not found.");
    }

    if (dto.overrideGrade !== null) {
      const boundaries = await this.prisma.gradeBoundary.findMany({ where: { schoolId } });
      if (!boundaries.some((b) => b.grade === dto.overrideGrade)) {
        throw new BadRequestException(`"${dto.overrideGrade}" is not a valid grade for this school's grading scale.`);
      }
    }

    const lockKey = this.subjectLockKey(schoolId, row.subjectId, row.classArmId, row.termId);

    return this.prisma.$transaction(
      async (tx) => {
        // Same lock a concurrent saveGrid/publish/unpublish for this grid
        // would hold — serializes override against all of them.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        // Re-read inside the lock: status may have changed between the
        // pre-lock fetch above and here (a concurrent publish/unpublish/
        // score-clear).
        const fresh = await tx.termSubjectResult.findUniqueOrThrow({ where: { id: dto.termSubjectResultId } });
        if (fresh.status === ResultStatus.DRAFT) {
          throw new ConflictException(
            "Cannot override: this subject's total isn't final yet (no approval-required score entered). Override is available once the result reaches PENDING_APPROVAL or PUBLISHED.",
          );
        }
        if (fresh.status === ResultStatus.PUBLISHED && user.role !== UserRole.PROPRIETOR) {
          throw new ForbiddenException("Only the school owner (PROPRIETOR) may override a published result.");
        }

        const finalGrade = resolveFinalGrade(fresh.autoGrade, dto.overrideGrade);
        const updated = await tx.termSubjectResult.update({
          where: { id: dto.termSubjectResultId },
          data: { overrideGrade: dto.overrideGrade, finalGrade },
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "grades.override",
            entityType: "grades",
            entityId: dto.termSubjectResultId,
            metadata: {
              studentId: fresh.studentId,
              subjectId: fresh.subjectId,
              classArmId: fresh.classArmId,
              termId: fresh.termId,
              oldOverrideGrade: fresh.overrideGrade,
              newOverrideGrade: dto.overrideGrade,
            },
          },
        });

        return {
          id: updated.id,
          studentId: updated.studentId,
          subjectId: updated.subjectId,
          termId: updated.termId,
          overrideGrade: updated.overrideGrade,
          autoGrade: updated.autoGrade,
          finalGrade: updated.finalGrade,
          status: updated.status,
        };
      },
      { timeout: 10000 },
    );
  }

  // Re-derives term_subject_results for each given student from ALL of
  // their current student_scores for (subjectId, termId, sessionId) —
  // across every active component, not just whichever one triggered this
  // call — using the pure functions in grade-computation.ts. Callers must
  // have already verified none of these students' existing results are
  // PUBLISHED; this function does not re-check (and is safe to call on a
  // formerly-published row transitioning OUT of PUBLISHED, e.g. from
  // unpublish() — that's the one case where a row IS published going in).
  //
  // subject_position/published_at are unconditionally cleared on every
  // call: this function only ever runs on rows that are not (or are no
  // longer, mid-unpublish) PUBLISHED, so a position/publish timestamp can
  // never legitimately survive a recompute — publish() is the only place
  // that sets them, directly, after this function returns.
  //
  // override_grade is preserved across a recompute UNLESS the recomputed
  // status is DRAFT, in which case it's cleared here too — not just
  // blocked at the override endpoint. PENDING_APPROVAL -> DRAFT is
  // reachable via a score write that clears the approval-required
  // component's score, and without this, a previously-set override would
  // silently keep applying to a total that's no longer final (step-3
  // resolution: override_grade is non-null only when status is
  // PENDING_APPROVAL or PUBLISHED).
  private async recomputeStudents(
    tx: Prisma.TransactionClient,
    ctx: RecomputeContext,
    studentIds: string[],
  ): Promise<RecomputedRow[]> {
    const [components, boundaries, existingRows] = await Promise.all([
      tx.assessmentComponent.findMany({ where: { schoolId: ctx.schoolId, deletedAt: null } }),
      tx.gradeBoundary.findMany({ where: { schoolId: ctx.schoolId }, orderBy: { sortOrder: "asc" } }),
      tx.termSubjectResult.findMany({
        where: { studentId: { in: studentIds }, subjectId: ctx.subjectId, termId: ctx.termId, sessionId: ctx.sessionId },
      }),
    ]);
    const componentInputs: ComponentInput[] = components.map((c) => ({
      id: c.id,
      weight: c.weight,
      maxScore: c.maxScore,
      requiresApproval: c.requiresApproval,
    }));
    const boundaryInputs: GradeBoundaryInput[] = boundaries.map((b) => ({
      grade: b.grade,
      minScore: b.minScore,
      maxScore: b.maxScore,
    }));
    const existingOverrideByStudent = new Map(existingRows.map((r) => [r.studentId, r.overrideGrade]));

    const results: RecomputedRow[] = [];
    for (const studentId of studentIds) {
      const scores = await tx.studentScore.findMany({
        where: { studentId, subjectId: ctx.subjectId, termId: ctx.termId, sessionId: ctx.sessionId },
      });
      const scoreInputs: ComponentScoreInput[] = scores.map((s) => ({
        componentId: s.componentId,
        rawScore: s.rawScore === null ? null : Number(s.rawScore),
      }));
      const totalScore = computeSubjectTotal(componentInputs, scoreInputs);
      const status = computeSubjectStatus(componentInputs, scoreInputs);
      const autoGrade = resolveGradeBand(totalScore, boundaryInputs);
      const overrideGrade = status === ResultStatus.DRAFT ? null : (existingOverrideByStudent.get(studentId) ?? null);
      const finalGrade = resolveFinalGrade(autoGrade, overrideGrade);

      const saved = await tx.termSubjectResult.upsert({
        where: {
          studentId_subjectId_termId_sessionId: {
            studentId,
            subjectId: ctx.subjectId,
            termId: ctx.termId,
            sessionId: ctx.sessionId,
          },
        },
        update: {
          totalScore,
          autoGrade,
          finalGrade,
          status,
          classArmId: ctx.classArmId,
          overrideGrade,
          subjectPosition: null,
          publishedAt: null,
        },
        create: {
          schoolId: ctx.schoolId,
          studentId,
          subjectId: ctx.subjectId,
          sessionId: ctx.sessionId,
          termId: ctx.termId,
          classArmId: ctx.classArmId,
          totalScore,
          autoGrade,
          finalGrade,
          status,
        },
      });
      results.push({
        studentId,
        totalScore: Number(saved.totalScore),
        autoGrade: saved.autoGrade,
        finalGrade: saved.finalGrade,
        status: saved.status,
      });
    }
    return results;
  }

  // Recomputes term_overall_results for EVERY student who has at least
  // one term_subject_result in this class arm/term — not just students
  // directly touched by whatever publish/unpublish just ran. Necessary
  // because removing or adding one student from the "fully published"
  // ranked cohort shifts everyone else's overall_position too (a smaller
  // or larger cohort re-ranks as a whole), so any change to that cohort's
  // membership requires re-ranking the whole class arm, not just the
  // student(s) that changed. Read side is one batched query (no N+1); the
  // write side is a per-student upsert loop via Promise.all, same pattern
  // as recomputeStudents/seed.ts's seedOverallResults — SPEC_V0.4.md §5's
  // "set-based SQL, not per-student loops" is honored on the read side;
  // the write side keeps this codebase's existing pattern rather than
  // introducing raw batched SQL inconsistent with the rest of the service
  // (proven fast enough for the real ~100-student class via a timed e2e).
  // Callers must hold the class-arm-level advisory lock before calling
  // this — it does not acquire it itself.
  private async recomputeOverallForClassArm(
    tx: Prisma.TransactionClient,
    ctx: { schoolId: string; classArmId: string; termId: string; sessionId: string },
  ): Promise<OverallRecomputeResult> {
    const [allResults, boundaries, existingOverall] = await Promise.all([
      tx.termSubjectResult.findMany({
        where: { schoolId: ctx.schoolId, classArmId: ctx.classArmId, termId: ctx.termId, sessionId: ctx.sessionId },
      }),
      tx.gradeBoundary.findMany({ where: { schoolId: ctx.schoolId }, orderBy: { sortOrder: "asc" } }),
      tx.termOverallResult.findMany({
        where: { schoolId: ctx.schoolId, classArmId: ctx.classArmId, termId: ctx.termId, sessionId: ctx.sessionId },
      }),
    ]);
    const boundaryInputs: GradeBoundaryInput[] = boundaries.map((b) => ({
      grade: b.grade,
      minScore: b.minScore,
      maxScore: b.maxScore,
    }));
    const existingStatusByStudent = new Map(existingOverall.map((o) => [o.studentId, o.status]));

    const byStudent = new Map<string, typeof allResults>();
    for (const row of allResults) {
      const arr = byStudent.get(row.studentId) ?? [];
      arr.push(row);
      byStudent.set(row.studentId, arr);
    }

    const computed = new Map<
      string,
      { averageScore: number; averageGrade: string | null; status: ResultStatus; subjectsCount: number }
    >();
    for (const [studentId, results] of byStudent) {
      const averageScore = computeOverallAverage(results.map((r) => Number(r.totalScore)));
      const status = computeOverallStatus(results.map((r) => r.status));
      computed.set(studentId, {
        averageScore,
        averageGrade: resolveGradeBand(averageScore, boundaryInputs),
        status,
        subjectsCount: results.length,
      });
    }

    // Positions computed ONLY among students whose overall is fully
    // PUBLISHED (SPEC_V0.4.md §1/§3 resolution: never a partial-data
    // rank) — a student missing even one subject's publish is excluded
    // entirely, not ranked on what exists so far.
    const publishedStudentIds = [...computed.entries()]
      .filter(([, v]) => v.status === ResultStatus.PUBLISHED)
      .map(([studentId]) => studentId);
    const ranking = computeStandardCompetitionRanking(publishedStudentIds, (studentId) => computed.get(studentId)!.averageScore);
    const positionByStudent = new Map(ranking.map(({ item, position }) => [item, position]));

    let publishedCount = 0;
    let revertedCount = 0;
    await Promise.all(
      [...computed.entries()].map(([studentId, value]) => {
        const wasPublished = existingStatusByStudent.get(studentId) === ResultStatus.PUBLISHED;
        if (value.status === ResultStatus.PUBLISHED && !wasPublished) publishedCount++;
        if (wasPublished && value.status !== ResultStatus.PUBLISHED) revertedCount++;

        const data = {
          averageScore: value.averageScore,
          averageGrade: value.averageGrade,
          subjectsCount: value.subjectsCount,
          status: value.status,
          overallPosition: positionByStudent.get(studentId) ?? null,
        };
        return tx.termOverallResult.upsert({
          where: { studentId_termId_sessionId: { studentId, termId: ctx.termId, sessionId: ctx.sessionId } },
          update: { classArmId: ctx.classArmId, ...data },
          create: { schoolId: ctx.schoolId, studentId, sessionId: ctx.sessionId, termId: ctx.termId, classArmId: ctx.classArmId, ...data },
        });
      }),
    );

    return { publishedCount, revertedCount };
  }

  private subjectLockKey(schoolId: string, subjectId: string, classArmId: string, termId: string): string {
    return `grades:${schoolId}:${subjectId}:${classArmId}:${termId}`;
  }

  private classArmLockKey(schoolId: string, classArmId: string, termId: string): string {
    return `grades:${schoolId}:${classArmId}:${termId}`;
  }

  // Structured, not just a count: the caller (a director/owner UI) needs
  // to know exactly WHICH students are locked, not just how many.
  // AllExceptionsFilter passes any extra fields on the exception's
  // response payload through the standard error envelope alongside
  // statusCode/message/error/path/timestamp.
  private publishedLockException(action: string, lockedStudentIds: string[]): ConflictException {
    return new ConflictException({
      message: `Cannot ${action}: this subject's result is already PUBLISHED for ${lockedStudentIds.length} student(s) — unpublish first.`,
      lockedStudentIds,
    });
  }

  private async getRoster(schoolId: string, classArmId: string, sessionId: string) {
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: forSchool(schoolId, {
        classArmId,
        sessionId,
        student: { deletedAt: null, status: { not: StudentStatus.WITHDRAWN } },
      }),
      include: { student: true },
      orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }, { studentId: "asc" }],
    });
    return enrollments.map((e) => e.student);
  }

  // TEACHER: must hold a subject_teacher_assignment for this exact
  // (subject, class arm, session) — assignments are session-scoped, not
  // term-scoped (SPEC_V0.4.md §2 note), so term is just which term's
  // scores are being entered within that assignment. SCHOOL_ADMIN/
  // PROPRIETOR: no check, any tenant-scoped combo is allowed. Must run
  // AFTER tenant-scope resolution (404s first), so a cross-tenant probe
  // always gets a uniform 404 regardless of role.
  private async assertTeacherAssignment(
    schoolId: string,
    user: AuthenticatedUser,
    subjectId: string,
    classArmId: string,
    sessionId: string,
  ): Promise<void> {
    if (user.role !== UserRole.TEACHER) {
      return;
    }
    const assignment = await this.prisma.subjectTeacherAssignment.findFirst({
      where: forSchool(schoolId, { subjectId, classArmId, sessionId, teacherUserId: user.userId }),
    });
    if (!assignment) {
      throw new ForbiddenException("You are not assigned to teach this subject for this class.");
    }
  }

  private async resolveTenantScopeWithComponent(
    schoolId: string,
    ids: { classArmId: string; subjectId: string; componentId: string; termId: string },
  ): Promise<{ term: Term; component: AssessmentComponent }> {
    const [classArm, subject, term, component] = await Promise.all([
      this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: ids.classArmId }) }),
      this.prisma.subject.findFirst({ where: forSchool(schoolId, { id: ids.subjectId, deletedAt: null }) }),
      this.prisma.term.findFirst({ where: forSchool(schoolId, { id: ids.termId }) }),
      this.prisma.assessmentComponent.findFirst({ where: forSchool(schoolId, { id: ids.componentId, deletedAt: null }) }),
    ]);
    if (!classArm) throw new NotFoundException("Class arm not found.");
    if (!subject) throw new NotFoundException("Subject not found.");
    if (!term) throw new NotFoundException("Term not found.");
    if (!component) throw new NotFoundException("Assessment component not found.");
    return { term, component };
  }

  private async resolveTenantScopeSubjectOnly(
    schoolId: string,
    ids: { classArmId: string; subjectId: string; termId: string },
  ): Promise<{ term: Term }> {
    const [classArm, subject, term] = await Promise.all([
      this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: ids.classArmId }) }),
      this.prisma.subject.findFirst({ where: forSchool(schoolId, { id: ids.subjectId, deletedAt: null }) }),
      this.prisma.term.findFirst({ where: forSchool(schoolId, { id: ids.termId }) }),
    ]);
    if (!classArm) throw new NotFoundException("Class arm not found.");
    if (!subject) throw new NotFoundException("Subject not found.");
    if (!term) throw new NotFoundException("Term not found.");
    return { term };
  }
}
