import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ResultStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import {
  computeEvaluationAverage,
  computeStandardCompetitionRanking,
  resolveGradeBand,
  type DecidableScoreInput,
  type GradeBoundaryInput,
} from "../grades/grade-computation";
import { termLockKey, examSubjectLockKey, examClassArmLockKey, examYearLockKey } from "../grades/lock-keys";
import {
  getRoster,
  resolveSliceLockState,
  resolveTenantScopeSubjectOnly,
  assertTeacherAssignment,
} from "../grades/grade-shared.util";
import { GetExamScoresQueryDto } from "./dto/get-exam-scores-query.dto";
import { SaveExamScoresDto } from "./dto/save-exam-scores.dto";
import { RecomputeExamGradesDto } from "./dto/recompute-exam-grades.dto";
import { PublishExamGradesDto } from "./dto/publish-exam-grades.dto";
import { UnpublishExamGradesDto } from "./dto/unpublish-exam-grades.dto";

export interface ExamScoresRow {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  rawScore: number | null;
  isAbsent: boolean;
  // The student's SUBJECT-level exam status (term_subject_exam_result),
  // not exam-level — same "load-time lock state" idea as
  // EvaluationScoresResponse (grades.service.ts).
  status: ResultStatus;
}

export interface ExamScoresResponse {
  classArmId: string;
  subjectId: string;
  examId: string;
  termId: string;
  termClosed: boolean;
  locked: boolean;
  unlockReason: string | null;
  rows: ExamScoresRow[];
}

export interface SavedExamScoreRow {
  studentId: string;
  rawScore: number | null;
  isAbsent: boolean;
  totalScore: number;
  autoGrade: string | null;
  status: ResultStatus;
}

export interface SaveExamScoresResponse {
  classArmId: string;
  subjectId: string;
  examId: string;
  termId: string;
  savedCount: number;
  rows: SavedExamScoreRow[];
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
  status: ResultStatus;
}

export interface PublishExamResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  publishedCount: number;
  termExamPublishedCount: number;
  yearExamRecomputedCount: number;
}

export interface UnpublishExamResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  unpublishedCount: number;
  termExamRevertedCount: number;
  yearExamRecomputedCount: number;
}

// SPEC_V0.7.md §2/§5, step 1: Track B — exams are scored/published
// entirely separately from evaluations (Track A) and NEVER contribute to
// term_subject_results/term_overall_results. Mirrors GradesService's
// evaluation-track methods closely (same lock ordering, same closed-term/
// published-lock rules, same completeness gate at publish) but simpler:
// no override endpoint (term_subject_exam_results has no override_grade —
// Q4's edit/authoring rules are Step 2+), no subjectPosition (Q6 ranks
// only at the per-term cross-subject level (b) and the whole-year level
// (c), never per-subject), and two extra cascades publish/unpublish must
// drive: TermExamResult (per-term, analog of TermOverallResult) and
// YearExamResult (whole-year, spans all three terms, no separate publish
// action of its own — confirmed, purely derived/cached).
@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async getExamScores(query: GetExamScoresQueryDto, user: AuthenticatedUser): Promise<ExamScoresResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await this.resolveTenantScopeWithExam(schoolId, query);
    await assertTeacherAssignment(this.prisma, schoolId, user, query.subjectId, query.classArmId, term.sessionId);

    const [students, scores, subjectResults, lockState] = await Promise.all([
      getRoster(this.prisma, schoolId, query.classArmId, term.sessionId),
      this.prisma.examScore.findMany({ where: { examId: query.examId } }),
      this.prisma.termSubjectExamResult.findMany({
        where: { schoolId, subjectId: query.subjectId, termId: query.termId, sessionId: term.sessionId },
      }),
      resolveSliceLockState(this.prisma, {
        termId: query.termId,
        classArmId: query.classArmId,
        subjectId: query.subjectId,
        closedAt: term.closedAt,
      }),
    ]);
    const rawByStudent = new Map(scores.map((s) => [s.studentId, s.rawScore === null ? null : Number(s.rawScore)]));
    const absentByStudent = new Map(scores.map((s) => [s.studentId, s.isAbsent]));
    const statusByStudent = new Map(subjectResults.map((r) => [r.studentId, r.status]));

    return {
      classArmId: query.classArmId,
      subjectId: query.subjectId,
      examId: query.examId,
      termId: query.termId,
      termClosed: term.closedAt !== null,
      locked: lockState.locked,
      unlockReason: lockState.unlockReason,
      rows: students.map((s) => ({
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        admissionNumber: s.admissionNumber,
        rawScore: rawByStudent.get(s.id) ?? null,
        isAbsent: absentByStudent.get(s.id) ?? false,
        status: statusByStudent.get(s.id) ?? ResultStatus.DRAFT,
      })),
    };
  }

  // Bulk upsert, atomic per request — same shape/lock ordering as
  // GradesService.saveEvaluationScores, keyed to a specific exam. Term
  // lock is the SAME shared key (lock-keys.ts) — a closed term blocks
  // editing either track — but the subject/class-arm locks below use the
  // exam-track's own distinct namespace, so evaluation and exam writes for
  // the same subject/term never contend with each other.
  async saveExamScores(dto: SaveExamScoresDto, user: AuthenticatedUser): Promise<SaveExamScoresResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await this.resolveTenantScopeWithExam(schoolId, dto);
    await assertTeacherAssignment(this.prisma, schoolId, user, dto.subjectId, dto.classArmId, term.sessionId);

    const students = await getRoster(this.prisma, schoolId, dto.classArmId, term.sessionId);
    const rosterIds = new Set(students.map((s) => s.id));

    for (const item of dto.scores) {
      if (!rosterIds.has(item.studentId)) {
        throw new BadRequestException(`Student ${item.studentId} is not enrolled in this class arm.`);
      }
      if (item.rawScore !== null && item.rawScore !== undefined) {
        if (item.rawScore < 0 || item.rawScore > 100) {
          throw new BadRequestException(`rawScore for student ${item.studentId} must be between 0 and 100.`);
        }
      }
    }

    const affectedStudentIds = [...new Set(dto.scores.map((s) => s.studentId))];
    const termLock = termLockKey(schoolId, dto.termId);
    const subjLockKey = examSubjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);

    return this.prisma.$transaction(
      async (tx) => {
        // Term-level lock FIRST, always — same shared key close()/unlock()/
        // relock() (terms.service.ts) and the evaluation track's
        // saveEvaluationScores use. Serializes this save against a
        // concurrent close/unlock/relock.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${termLock}))`;

        const freshTerm = await tx.term.findUniqueOrThrow({ where: { id: dto.termId } });
        const { locked } = await resolveSliceLockState(tx, {
          termId: dto.termId,
          classArmId: dto.classArmId,
          subjectId: dto.subjectId,
          closedAt: freshTerm.closedAt,
        });
        if (locked) {
          throw new ConflictException({
            message: "This term is closed. Ask your principal/proprietor to unlock this class and subject before editing.",
            termLocked: true,
          });
        }

        // Serializes concurrent exam-score saves for the same subject +
        // class + term — exam-track's own lock namespace, never contends
        // with a concurrent evaluation-track save for the same subject.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjLockKey}))`;

        const existingResults = await tx.termSubjectExamResult.findMany({
          where: {
            studentId: { in: affectedStudentIds },
            subjectId: dto.subjectId,
            termId: dto.termId,
            sessionId: term.sessionId,
          },
        });
        const lockedStudentIds = existingResults.filter((r) => r.status === ResultStatus.PUBLISHED).map((r) => r.studentId);
        const isPublishedBypassAllowed = user.role === UserRole.SCHOOL_ADMIN || user.role === UserRole.PROPRIETOR;
        if (lockedStudentIds.length > 0 && !isPublishedBypassAllowed) {
          throw this.publishedLockException("save scores", lockedStudentIds);
        }
        const bypassedPublishedStudentIds = new Set<string>(isPublishedBypassAllowed ? lockedStudentIds : []);

        await Promise.all(
          dto.scores.map((item) => {
            const rawScore = item.rawScore ?? null;
            const isAbsent = item.isAbsent ?? false;
            return tx.examScore.upsert({
              where: { examId_studentId: { examId: dto.examId, studentId: item.studentId } },
              update: { rawScore, isAbsent, enteredBy: user.userId, enteredAt: new Date() },
              create: {
                examId: dto.examId,
                studentId: item.studentId,
                rawScore,
                isAbsent,
                enteredBy: user.userId,
                enteredAt: new Date(),
              },
            });
          }),
        );

        const recomputed = await this.recomputeExamStudents(
          tx,
          { schoolId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId, classArmId: dto.classArmId },
          affectedStudentIds,
          bypassedPublishedStudentIds,
        );

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "exams.saveExamScores",
            entityType: "exams",
            entityId: dto.classArmId,
            metadata: {
              subjectId: dto.subjectId,
              examId: dto.examId,
              termId: dto.termId,
              scoreCount: dto.scores.length,
              publishedBypassStudentIds: [...bypassedPublishedStudentIds],
            },
          },
        });

        const rawByStudent = new Map(dto.scores.map((s) => [s.studentId, s.rawScore ?? null]));
        const absentByStudent = new Map(dto.scores.map((s) => [s.studentId, s.isAbsent ?? false]));
        return {
          classArmId: dto.classArmId,
          subjectId: dto.subjectId,
          examId: dto.examId,
          termId: dto.termId,
          savedCount: dto.scores.length,
          rows: recomputed.map((r) => ({
            studentId: r.studentId,
            rawScore: rawByStudent.get(r.studentId) ?? null,
            isAbsent: absentByStudent.get(r.studentId) ?? false,
            totalScore: r.totalScore,
            autoGrade: r.autoGrade,
            status: r.status,
          })),
        };
      },
      { timeout: 20000 },
    );
  }

  // Admin-only manual re-trigger — re-derives term_subject_exam_results for
  // a whole class arm + subject + term from whatever exam_scores currently
  // exist. No overall/year cascade here (mirrors GradesService.recompute:
  // not gated by the closed-term check, re-derives only from data that
  // already passed that gate at write time).
  async recompute(dto: RecomputeExamGradesDto): Promise<{ recomputedCount: number }> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeSubjectOnly(this.prisma, schoolId, dto);

    const students = await getRoster(this.prisma, schoolId, dto.classArmId, term.sessionId);
    const studentIds = students.map((s) => s.id);
    if (studentIds.length === 0) {
      return { recomputedCount: 0 };
    }

    const lockKey = examSubjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const existingResults = await tx.termSubjectExamResult.findMany({
          where: { studentId: { in: studentIds }, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId },
        });
        const lockedStudentIds = existingResults.filter((r) => r.status === ResultStatus.PUBLISHED).map((r) => r.studentId);
        if (lockedStudentIds.length > 0) {
          throw this.publishedLockException("recompute", lockedStudentIds);
        }

        const recomputed = await this.recomputeExamStudents(
          tx,
          { schoolId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId, classArmId: dto.classArmId },
          studentIds,
        );

        return { recomputedCount: recomputed.length };
      },
      { timeout: 20000 },
    );
  }

  // Transitions a subject's DRAFT exam results to PUBLISHED, then cascades
  // upward: TermExamResult (per-term cross-subject, ranking (b)) and
  // YearExamResult (whole-year, ranking (c)) — confirmed: the year cascade
  // has no separate manual publish action of its own, it's recomputed
  // progressively as terms publish. No subjectPosition/re-ranking at THIS
  // level (schema has none for term_subject_exam_results — Q6 ranks only
  // at (b)/(c)). Same completeness gate/rejection shape as
  // GradesService.publish (confirmed: same publish model as v0.4).
  async publish(dto: PublishExamGradesDto, user: AuthenticatedUser): Promise<PublishExamResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeSubjectOnly(this.prisma, schoolId, dto);

    const subjectLockKey = examSubjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);
    const classArmLockKey = examClassArmLockKey(schoolId, dto.classArmId, dto.termId);
    const yearLockKey = examYearLockKey(schoolId, term.sessionId);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjectLockKey}))`;

        const existing = await tx.termSubjectExamResult.findMany({
          where: { schoolId, classArmId: dto.classArmId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId },
        });
        const toPublish = existing.filter((r) => r.status === ResultStatus.DRAFT);
        const alreadyPublished = existing.filter((r) => r.status === ResultStatus.PUBLISHED);

        if (toPublish.length === 0 && alreadyPublished.length === 0) {
          throw new ConflictException("Nothing to publish for this subject: no exam scores have been entered yet.");
        }

        if (toPublish.length > 0) {
          const incompleteEntries = await this.findIncompleteExamEntries(
            tx,
            { schoolId, termId: dto.termId, sessionId: term.sessionId },
            toPublish.map((row) => ({ subjectId: dto.subjectId, studentId: row.studentId })),
          );
          if (incompleteEntries.length > 0) {
            const incompleteStudentCount = new Set(incompleteEntries.map((e) => e.studentId)).size;
            throw new ConflictException({
              message: `Cannot publish: ${incompleteStudentCount} student(s) have at least one exam that's neither scored nor marked absent.`,
              incompleteEntries: incompleteEntries.map(({ studentId, examId }) => ({ studentId, examId })),
            });
          }
        }

        const now = new Date();
        await Promise.all(
          toPublish.map((row) =>
            tx.termSubjectExamResult.update({
              where: { id: row.id },
              data: { status: ResultStatus.PUBLISHED, publishedAt: now },
            }),
          ),
        );

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "exams.publish",
            entityType: "exams",
            entityId: dto.classArmId,
            metadata: { subjectId: dto.subjectId, termId: dto.termId, publishedCount: toPublish.length },
          },
        });

        // Broader lock for the cross-subject term cascade — same reasoning
        // as GradesService.publish's classArmLockKey acquisition.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${classArmLockKey}))`;
        const termCascade = await this.recomputeExamOverallForClassArm(tx, {
          schoolId,
          classArmId: dto.classArmId,
          termId: dto.termId,
          sessionId: term.sessionId,
        });

        // Coarsest lock last (whole session, not just this class arm/term)
        // — extended ordering term -> subject -> class-arm -> year, never
        // reversed (lock-keys.ts).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${yearLockKey}))`;
        const yearCascade = await this.recomputeYearExamResults(tx, { schoolId, sessionId: term.sessionId });

        return {
          classArmId: dto.classArmId,
          subjectId: dto.subjectId,
          termId: dto.termId,
          publishedCount: toPublish.length,
          termExamPublishedCount: termCascade.publishedCount,
          yearExamRecomputedCount: yearCascade.recomputedCount,
        };
      },
      { timeout: 20000 },
    );
  }

  // Reverts a subject's PUBLISHED exam results back to DRAFT and cascades
  // the same two levels upward — mirrors GradesService.unpublish.
  // PROPRIETOR only (owner authority, same as the evaluation track).
  async unpublish(dto: UnpublishExamGradesDto, user: AuthenticatedUser): Promise<UnpublishExamResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeSubjectOnly(this.prisma, schoolId, dto);

    const subjectLockKey = examSubjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);
    const classArmLockKey = examClassArmLockKey(schoolId, dto.classArmId, dto.termId);
    const yearLockKey = examYearLockKey(schoolId, term.sessionId);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjectLockKey}))`;

        const published = await tx.termSubjectExamResult.findMany({
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
          throw new ConflictException("Nothing to unpublish: this subject has no published exam results.");
        }

        const studentIds = published.map((row) => row.studentId);
        await this.recomputeExamStudents(
          tx,
          { schoolId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId, classArmId: dto.classArmId },
          studentIds,
        );

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "exams.unpublish",
            entityType: "exams",
            entityId: dto.classArmId,
            metadata: { subjectId: dto.subjectId, termId: dto.termId, unpublishedCount: studentIds.length },
          },
        });

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${classArmLockKey}))`;
        const termCascade = await this.recomputeExamOverallForClassArm(tx, {
          schoolId,
          classArmId: dto.classArmId,
          termId: dto.termId,
          sessionId: term.sessionId,
        });

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${yearLockKey}))`;
        const yearCascade = await this.recomputeYearExamResults(tx, { schoolId, sessionId: term.sessionId });

        return {
          classArmId: dto.classArmId,
          subjectId: dto.subjectId,
          termId: dto.termId,
          unpublishedCount: studentIds.length,
          termExamRevertedCount: termCascade.revertedCount,
          yearExamRecomputedCount: yearCascade.recomputedCount,
        };
      },
      { timeout: 20000 },
    );
  }

  // Re-derives term_subject_exam_results for each given student from ALL
  // of their current exam_scores across every active Exam for (classArmId,
  // subjectId, termId) — mirrors GradesService.recomputeStudents exactly,
  // minus overrideGrade/finalGrade/subjectPosition (no such fields on this
  // table — see model's own comment).
  private async recomputeExamStudents(
    tx: Prisma.TransactionClient,
    ctx: RecomputeContext,
    studentIds: string[],
    preservePublishedStudentIds?: Set<string>,
  ): Promise<RecomputedRow[]> {
    const [exams, boundaries] = await Promise.all([
      tx.exam.findMany({
        where: { schoolId: ctx.schoolId, classArmId: ctx.classArmId, subjectId: ctx.subjectId, termId: ctx.termId, deletedAt: null },
        select: { id: true },
      }),
      tx.gradeBoundary.findMany({ where: { schoolId: ctx.schoolId }, orderBy: { sortOrder: "asc" } }),
    ]);
    const examIds = exams.map((e) => e.id);
    const boundaryInputs: GradeBoundaryInput[] = boundaries.map((b) => ({
      grade: b.grade,
      minScore: b.minScore,
      maxScore: b.maxScore,
    }));

    const allScores =
      examIds.length > 0 ? await tx.examScore.findMany({ where: { examId: { in: examIds }, studentId: { in: studentIds } } }) : [];
    const scoresByStudent = new Map<string, typeof allScores>();
    for (const score of allScores) {
      const arr = scoresByStudent.get(score.studentId) ?? [];
      arr.push(score);
      scoresByStudent.set(score.studentId, arr);
    }

    const results: RecomputedRow[] = [];
    for (const studentId of studentIds) {
      const scores = scoresByStudent.get(studentId) ?? [];
      const scoreInputs: DecidableScoreInput[] = scores.map((s) => ({
        rawScore: s.rawScore === null ? null : Number(s.rawScore),
        isAbsent: s.isAbsent,
      }));
      const totalScore = computeEvaluationAverage(scoreInputs);
      const preservePublished = preservePublishedStudentIds?.has(studentId) ?? false;
      const status = preservePublished ? ResultStatus.PUBLISHED : ResultStatus.DRAFT;
      const autoGrade = resolveGradeBand(totalScore, boundaryInputs);

      const saved = await tx.termSubjectExamResult.upsert({
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
          status,
          classArmId: ctx.classArmId,
          publishedAt: preservePublished ? undefined : null,
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
          status,
        },
      });
      results.push({
        studentId,
        totalScore: Number(saved.totalScore),
        autoGrade: saved.autoGrade,
        status: saved.status,
      });
    }
    return results;
  }

  // Recomputes term_exam_results (ranking (b)) for every student who has
  // at least one term_subject_exam_result in this class arm/term — mirrors
  // GradesService.recomputeOverallForClassArm. "Fully exam-published"
  // (every subject exam result PUBLISHED) is what makes a student rank-
  // eligible, same all-or-nothing rule as the evaluation track's overall.
  private async recomputeExamOverallForClassArm(
    tx: Prisma.TransactionClient,
    ctx: { schoolId: string; classArmId: string; termId: string; sessionId: string },
  ): Promise<{ publishedCount: number; revertedCount: number }> {
    const [allResults, boundaries, existingOverall] = await Promise.all([
      tx.termSubjectExamResult.findMany({
        where: { schoolId: ctx.schoolId, classArmId: ctx.classArmId, termId: ctx.termId, sessionId: ctx.sessionId },
      }),
      tx.gradeBoundary.findMany({ where: { schoolId: ctx.schoolId }, orderBy: { sortOrder: "asc" } }),
      tx.termExamResult.findMany({
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

    const computed = new Map<string, { averageScore: number; averageGrade: string | null; status: ResultStatus; subjectsCount: number }>();
    for (const [studentId, results] of byStudent) {
      const allPublished = results.every((r) => r.status === ResultStatus.PUBLISHED);
      const averageScore = computeEvaluationAverage(results.map((r) => ({ rawScore: Number(r.totalScore), isAbsent: false })));
      computed.set(studentId, {
        averageScore,
        averageGrade: resolveGradeBand(averageScore, boundaryInputs),
        status: allPublished ? ResultStatus.PUBLISHED : ResultStatus.DRAFT,
        subjectsCount: results.length,
      });
    }

    const publishedStudentIds = [...computed.entries()].filter(([, v]) => v.status === ResultStatus.PUBLISHED).map(([studentId]) => studentId);
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
          examPosition: positionByStudent.get(studentId) ?? null,
        };
        return tx.termExamResult.upsert({
          where: { studentId_termId_sessionId: { studentId, termId: ctx.termId, sessionId: ctx.sessionId } },
          update: { classArmId: ctx.classArmId, ...data },
          create: { schoolId: ctx.schoolId, studentId, sessionId: ctx.sessionId, termId: ctx.termId, classArmId: ctx.classArmId, ...data },
        });
      }),
    );

    return { publishedCount, revertedCount };
  }

  // Recomputes year_exam_results (ranking (c)) for the WHOLE session (not
  // one class arm — a student may move class arms between terms, and the
  // model itself has no classArmId), from every currently-PUBLISHED
  // term_exam_result this session, across all three terms. Purely derived
  // — confirmed no separate manual publish action; recomputed progressively
  // as each term's exam track publishes. Ranked only among students with
  // >=1 published term this session (confirmed) — a student with zero
  // published terms gets no row at all (not a DRAFT placeholder), so
  // "does this row exist" alone answers "is this student ranked yet."
  private async recomputeYearExamResults(
    tx: Prisma.TransactionClient,
    ctx: { schoolId: string; sessionId: string },
  ): Promise<{ recomputedCount: number }> {
    const [publishedTermResults, boundaries] = await Promise.all([
      tx.termExamResult.findMany({
        where: { schoolId: ctx.schoolId, sessionId: ctx.sessionId, status: ResultStatus.PUBLISHED },
      }),
      tx.gradeBoundary.findMany({ where: { schoolId: ctx.schoolId }, orderBy: { sortOrder: "asc" } }),
    ]);
    const boundaryInputs: GradeBoundaryInput[] = boundaries.map((b) => ({
      grade: b.grade,
      minScore: b.minScore,
      maxScore: b.maxScore,
    }));

    const byStudent = new Map<string, typeof publishedTermResults>();
    for (const row of publishedTermResults) {
      const arr = byStudent.get(row.studentId) ?? [];
      arr.push(row);
      byStudent.set(row.studentId, arr);
    }

    const computed = new Map<string, { averageScore: number; averageGrade: string | null; termsCount: number }>();
    for (const [studentId, results] of byStudent) {
      const averageScore = computeEvaluationAverage(results.map((r) => ({ rawScore: Number(r.averageScore), isAbsent: false })));
      computed.set(studentId, {
        averageScore,
        averageGrade: resolveGradeBand(averageScore, boundaryInputs),
        termsCount: results.length,
      });
    }

    const eligibleStudentIds = [...computed.keys()];
    const ranking = computeStandardCompetitionRanking(eligibleStudentIds, (studentId) => computed.get(studentId)!.averageScore);
    const positionByStudent = new Map(ranking.map(({ item, position }) => [item, position]));

    await Promise.all(
      eligibleStudentIds.map((studentId) => {
        const value = computed.get(studentId)!;
        const data = {
          averageScore: value.averageScore,
          averageGrade: value.averageGrade,
          termsCount: value.termsCount,
          status: ResultStatus.PUBLISHED,
          yearExamPosition: positionByStudent.get(studentId) ?? null,
        };
        return tx.yearExamResult.upsert({
          where: { studentId_sessionId: { studentId, sessionId: ctx.sessionId } },
          update: data,
          create: { schoolId: ctx.schoolId, studentId, sessionId: ctx.sessionId, ...data },
        });
      }),
    );

    return { recomputedCount: eligibleStudentIds.length };
  }

  // Batched completeness check, mirrors GradesService.findIncompleteEntries
  // exactly — "blank" = no exam_scores row, or a row with rawScore IS NULL
  // AND isAbsent = false; absent is NOT blank.
  private async findIncompleteExamEntries(
    tx: Prisma.TransactionClient,
    ctx: { schoolId: string; termId: string; sessionId: string },
    candidates: Array<{ subjectId: string; studentId: string }>,
  ): Promise<Array<{ subjectId: string; studentId: string; examId: string }>> {
    if (candidates.length === 0) return [];

    const subjectIds = [...new Set(candidates.map((c) => c.subjectId))];
    const studentIds = [...new Set(candidates.map((c) => c.studentId))];

    const exams = await tx.exam.findMany({
      where: { schoolId: ctx.schoolId, termId: ctx.termId, sessionId: ctx.sessionId, subjectId: { in: subjectIds }, deletedAt: null },
      select: { id: true, subjectId: true },
    });
    const examsBySubject = new Map<string, string[]>();
    for (const e of exams) {
      const arr = examsBySubject.get(e.subjectId) ?? [];
      arr.push(e.id);
      examsBySubject.set(e.subjectId, arr);
    }
    const allExamIds = exams.map((e) => e.id);

    const scores = allExamIds.length
      ? await tx.examScore.findMany({ where: { examId: { in: allExamIds }, studentId: { in: studentIds } } })
      : [];
    const decided = new Set(
      scores.filter((s) => (s.rawScore !== null && s.rawScore !== undefined) || s.isAbsent).map((s) => `${s.examId}:${s.studentId}`),
    );

    const incomplete: Array<{ subjectId: string; studentId: string; examId: string }> = [];
    for (const { subjectId, studentId } of candidates) {
      const subjectExamIds = examsBySubject.get(subjectId) ?? [];
      for (const examId of subjectExamIds) {
        if (!decided.has(`${examId}:${studentId}`)) {
          incomplete.push({ subjectId, studentId, examId });
        }
      }
    }
    return incomplete;
  }

  private publishedLockException(action: string, lockedStudentIds: string[]): ConflictException {
    return new ConflictException({
      message: `Cannot ${action}: this subject's exam result is already PUBLISHED for ${lockedStudentIds.length} student(s) — unpublish first.`,
      lockedStudentIds,
    });
  }

  private async resolveTenantScopeWithExam(
    schoolId: string,
    ids: { classArmId: string; subjectId: string; examId: string; termId: string },
  ) {
    const [classArm, subject, term, exam] = await Promise.all([
      this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: ids.classArmId }) }),
      this.prisma.subject.findFirst({ where: forSchool(schoolId, { id: ids.subjectId, deletedAt: null }) }),
      this.prisma.term.findFirst({ where: forSchool(schoolId, { id: ids.termId }) }),
      this.prisma.exam.findFirst({
        where: forSchool(schoolId, {
          id: ids.examId,
          classArmId: ids.classArmId,
          subjectId: ids.subjectId,
          termId: ids.termId,
          deletedAt: null,
        }),
      }),
    ]);
    if (!classArm) throw new NotFoundException("Class arm not found.");
    if (!subject) throw new NotFoundException("Subject not found.");
    if (!term) throw new NotFoundException("Term not found.");
    if (!exam) throw new NotFoundException("Exam not found.");
    return { term };
  }
}
