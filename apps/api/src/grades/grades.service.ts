import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ResultStatus, UserRole, type Evaluation, type Term } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import {
  computeAssessmentClassStats,
  computeEvaluationAverage,
  computeOverallAverage,
  computeOverallStatus,
  computeStandardCompetitionRanking,
  resolveGradeBand,
  resolveFinalGrade,
  type DecidableScoreInput,
  type GradeBoundaryInput,
} from "../grades/grade-computation";
import { termLockKey, subjectLockKey as buildSubjectLockKey, classArmLockKey as buildClassArmLockKey } from "./lock-keys";
import { getAssignedSubjectMap } from "./subject-assignment.util";
import { resolveTeacherAccess } from "./teacher-access.util";
import {
  getRoster,
  resolveSliceLockState,
  resolveTenantScopeSubjectOnly,
  resolveTenantScopeArmTermOnly,
  assertTeacherAssignment,
  assertTeacherAssignmentForPublish,
} from "./grade-shared.util";
import { GetEvaluationScoresQueryDto } from "./dto/get-evaluation-scores-query.dto";
import { SaveEvaluationScoresDto } from "./dto/save-evaluation-scores.dto";
import { GetEvaluationsQueryDto } from "./dto/get-evaluations-query.dto";
import { CreateEvaluationDto } from "./dto/create-evaluation.dto";
import { UpdateEvaluationDto } from "./dto/update-evaluation.dto";
import { RecomputeGradesDto } from "./dto/recompute-grades.dto";
import { OverrideGradeDto } from "./dto/override-grade.dto";
import { GetGradesReviewQueryDto } from "./dto/get-grades-review-query.dto";
import { GetClassArmResultsQueryDto } from "./dto/get-class-arm-results-query.dto";
import { GetStudentResultsQueryDto } from "./dto/get-student-results-query.dto";
import { WriteRemarkDto } from "./dto/write-remark.dto";

export interface EvaluationScoresRow {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  rawScore: number | null;
  isAbsent: boolean;
}

export interface EvaluationScoresResponse {
  classArmId: string;
  subjectId: string;
  evaluationId: string;
  termId: string;
  // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — the evaluation's OWN status, read
  // once at the top level rather than per-row. Pre-v0.7.4 this was a
  // per-student `status` sourced from term_subject_result (subject-level
  // publish could leave stragglers mid-roster mid-publish); now that
  // publish is per-evaluation and atomic across its whole roster (the
  // completeness gate means every student is decided before publish
  // succeeds), one evaluation is either published for everyone on this
  // grid or for no one — a single top-level field is the accurate shape,
  // not a per-row one.
  evaluationStatus: ResultStatus;
  // SPEC_V0.5.md §2.3, v0.5 step 5, carried into v0.7 unchanged — lets the
  // grid render locked/read-only FROM LOAD, not reactively on a save 409.
  // termClosed=false always implies locked=false. unlockReason is
  // populated only when termClosed && !locked (an active unlock exists
  // for this exact class-arm+subject) — same lock-state resolution the
  // save path enforces (resolveSliceLockState), so the two can never
  // drift on what "locked" means. Orthogonal to evaluationStatus above:
  // this is the TERM-close lock, that is the PUBLISH lock — either can
  // be true independent of the other.
  termClosed: boolean;
  locked: boolean;
  unlockReason: string | null;
  rows: EvaluationScoresRow[];
}

export interface SavedEvaluationScoreRow {
  studentId: string;
  rawScore: number | null;
  isAbsent: boolean;
  totalScore: number;
  autoGrade: string | null;
  finalGrade: string | null;
  status: ResultStatus;
}

export interface SaveEvaluationScoresResponse {
  classArmId: string;
  subjectId: string;
  evaluationId: string;
  termId: string;
  savedCount: number;
  rows: SavedEvaluationScoreRow[];
}

// v0.7 step 2 (SPEC_V0.7.md §3) — the authoring surface. v0.7.4 step 1
// (SPEC_V0.7.4.md §2): the evaluation now carries its OWN status/
// publishedAt — publish is per-evaluation, so this is no longer "read
// fresh off term_subject_results," it's this row's own field, the
// single source every consumer (the picker's badge, the lock in
// saveEvaluationScores, the completeness gate) reads directly.
export interface EvaluationResponse {
  id: string;
  name: string;
  description: string;
  status: ResultStatus;
  publishedAt: Date | null;
  createdAt: Date;
  createdBy: string;
}

export interface EvaluationsListResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  termClosed: boolean;
  locked: boolean;
  unlockReason: string | null;
  evaluations: EvaluationResponse[];
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

// v0.7.4 step 1 (SPEC_V0.7.4.md §2) — replaces subject-level PublishResponse.
// publishedCount is the whole roster's size (the completeness gate means
// every student is decided by the time this succeeds), not a count of
// newly-published rows.
export interface PublishEvaluationResponse {
  evaluationId: string;
  classArmId: string;
  subjectId: string;
  termId: string;
  publishedCount: number;
  subjectPositions: SubjectPositionRow[];
  overallPublishedCount: number;
}

// v0.7.4 step 1 — replaces subject-level UnpublishResponse. No
// unpublishedCount: unlike the old subject-wide unpublish, this always
// reverts exactly one evaluation for the whole roster, so the count is
// never ambiguous or partial.
export interface UnpublishEvaluationResponse {
  evaluationId: string;
  classArmId: string;
  subjectId: string;
  termId: string;
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

export interface ClassArmResultsStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
}

export interface ClassArmResultsSubjectRow {
  // The term_subject_result id — lets an admin/owner viewer target this
  // exact row for PUT /grades/override without a second lookup.
  id: string;
  studentId: string;
  totalScore: number;
  autoGrade: string | null;
  overrideGrade: string | null;
  finalGrade: string | null;
  subjectPosition: number | null;
  status: ResultStatus;
}

export interface ClassArmResultsSubject {
  subjectId: string;
  subjectName: string;
  // SPEC_V0.5.1.md §2.1/§4: true when no subject_teacher_assignment exists
  // for (subjectId, classArmId, session) right now. This subject already
  // has real results (Q1(b) — never hidden once graded), it just needs a
  // teacher assigned to be gradeable/complete going forward.
  needsTeacherAssignment: boolean;
  averageScore: number;
  averageGrade: string | null;
  results: ClassArmResultsSubjectRow[];
}

export interface ClassArmResultsOverallRow {
  studentId: string;
  averageScore: number;
  averageGrade: string | null;
  overallPosition: number | null;
  status: ResultStatus;
  subjectsCount: number;
}

export interface ClassArmResultsResponse {
  classArmId: string;
  termId: string;
  students: ClassArmResultsStudent[];
  subjects: ClassArmResultsSubject[];
  // null (not []) when the caller is a subject-only TEACHER — distinguishes
  // "you may not see any overall picture" from "no one has any results yet".
  overall: ClassArmResultsOverallRow[] | null;
}

// v0.7.4 step 1 (SPEC_V0.7.4.md §2) — pure read-only oversight now.
// Publish/unpublish happens at the evaluation surface (EnterScoresTab),
// not here — no action this response's shape needs to drive, hence no
// canPublish.
export interface GradesReviewSubject {
  subjectId: string;
  subjectName: string;
  needsTeacherAssignment: boolean;
  rosterSize: number;
  draftCount: number;
  pendingApprovalCount: number;
  publishedCount: number;
  averageScore: number;
  averageGrade: string | null;
}

export interface GradesReviewResponse {
  classArmId: string;
  termId: string;
  subjects: GradesReviewSubject[];
}

export interface StudentResultSubject {
  subjectId: string;
  subjectName: string;
  needsTeacherAssignment: boolean;
  totalScore: number;
  autoGrade: string | null;
  overrideGrade: string | null;
  finalGrade: string | null;
  classAverageScore: number;
  classAverageGrade: string | null;
  subjectPosition: number | null;
  status: ResultStatus;
}

export interface StudentResultOverall {
  averageScore: number;
  averageGrade: string | null;
  overallPosition: number | null;
  status: ResultStatus;
  subjectsCount: number;
}

export interface StudentResultsResponse {
  studentId: string;
  termId: string;
  sessionId: string;
  subjects: StudentResultSubject[];
  // null when the student has zero term_subject_results this term (nothing
  // entered at all yet) — distinct from a real overall stuck at DRAFT.
  overall: StudentResultOverall | null;
}

// v0.7 step 4 (SPEC_V0.7.md §4). An evaluation with NO evaluation_scores
// row at all is `rawScore: null, isAbsent: false` — blank/not-entered,
// distinct from an explicit `isAbsent: true` ("Abs" on the printed card).
// Only the CURRENTLY ACTIVE evaluations are represented (deletedAt: null)
// — matches exactly what produced `totalScore` below; a soft-deleted
// evaluation's historical score is already excluded from every recompute.
// v0.7 step 5 (SPEC_V0.7.md §4) — comparative analytics, numbers only
// (no class-average grade letter this step). See computeAssessmentClassStats
// (grade-computation.ts) for the eligibility rule these three come from.
export interface ReportCardEvaluation {
  evaluationId: string;
  name: string;
  description: string;
  rawScore: number | null;
  isAbsent: boolean;
  classAverageScore: number | null;
  bestScore: number | null;
  worstScore: number | null;
}

export interface ReportCardSubject {
  subjectId: string;
  subjectName: string;
  needsTeacherAssignment: boolean;
  evaluations: ReportCardEvaluation[];
  totalScore: number;
  autoGrade: string | null;
  overrideGrade: string | null;
  finalGrade: string | null;
  subjectPosition: number | null;
  status: ResultStatus;
  classAverageScore: number | null;
}

export interface ReportCardOverall {
  averageScore: number;
  averageGrade: string | null;
  overallPosition: number | null;
  status: ResultStatus;
  subjectsCount: number;
  generalClassAverage: number | null;
}

interface RemarkAuthor {
  firstName: string;
  lastName: string;
}

export interface ReportCardRemarks {
  teacherRemark: string | null;
  teacherRemarkBy: RemarkAuthor | null;
  teacherRemarkAt: Date | null;
  principalRemark: string | null;
  principalRemarkBy: RemarkAuthor | null;
  principalRemarkAt: Date | null;
}

// A self-contained printable document (SPEC_V0.5.md §2.4) — student
// identity and remark-author names are embedded directly, unlike
// StudentResultsResponse above, whose caller already has student context.
export interface ReportCardResponse {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  classArmId: string;
  termId: string;
  sessionId: string;
  subjects: ReportCardSubject[];
  overall: ReportCardOverall | null;
  // v0.7.2 step 1 (SPEC_V0.7.2.md §2) — Pronote-style running average: a
  // NEW, ADDITIVE, on-read figure over PUBLISHED subjects so far. Top-
  // level sibling to `overall`, not nested inside it, so the type itself
  // signals independence from term_overall_results — can be non-null
  // while `overall` is still null mid-term. null (not 0) when zero
  // subjects are published yet. Mirrored by hand in
  // packages/shared/src/grades.ts, per this file's own convention.
  runningAverageScore: number | null;
  // v0.7.3 step 2 (SPEC_V0.7.3.md §3) — class-wide companions to
  // runningAverageScore: the mean of every published-so-far student's
  // OWN running average, and this student's provisional rank in that
  // same ≥1-published cohort (a DIFFERENT, looser pool than
  // overall.overallPosition's fully-published-only one — the two can
  // legitimately diverge). Mirrored by hand in packages/shared/src/grades.ts.
  runningClassAverageScore: number | null;
  runningPosition: number | null;
  remarks: ReportCardRemarks;
}

export interface RemarkResponse {
  id: string;
  studentId: string;
  termId: string;
  sessionId: string;
  classArmId: string;
  teacherRemark: string | null;
  teacherRemarkBy: string | null;
  teacherRemarkAt: Date | null;
  principalRemark: string | null;
  principalRemarkBy: string | null;
  principalRemarkAt: Date | null;
}

@Injectable()
export class GradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async getEvaluationScores(query: GetEvaluationScoresQueryDto, user: AuthenticatedUser): Promise<EvaluationScoresResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term, evaluation } = await this.resolveTenantScopeWithEvaluation(schoolId, query);
    await assertTeacherAssignment(this.prisma, schoolId, user, query.subjectId, query.classArmId, term.sessionId);

    const [students, scores, lockState] = await Promise.all([
      getRoster(this.prisma, schoolId, query.classArmId, term.sessionId),
      this.prisma.evaluationScore.findMany({ where: { evaluationId: query.evaluationId } }),
      resolveSliceLockState(this.prisma, {
        termId: query.termId,
        classArmId: query.classArmId,
        subjectId: query.subjectId,
        closedAt: term.closedAt,
      }),
    ]);
    const rawByStudent = new Map(scores.map((s) => [s.studentId, s.rawScore === null ? null : Number(s.rawScore)]));
    const absentByStudent = new Map(scores.map((s) => [s.studentId, s.isAbsent]));

    return {
      classArmId: query.classArmId,
      subjectId: query.subjectId,
      evaluationId: query.evaluationId,
      termId: query.termId,
      evaluationStatus: evaluation.status,
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
      })),
    };
  }

  // Bulk upsert, atomic per request — same shape as v0.4's saveGrid, keyed
  // to a specific evaluation instead of a fixed component; every score is
  // validated against the roster and clamped 0-100 (native — SPEC_V0.7.md
  // Q1, no per-evaluation maxScore) BEFORE any write. Re-sending an
  // identical payload is safe (idempotent) — evaluation_scores' existing
  // (evaluationId, studentId) unique is the upsert key.
  async saveEvaluationScores(dto: SaveEvaluationScoresDto, user: AuthenticatedUser): Promise<SaveEvaluationScoresResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await this.resolveTenantScopeWithEvaluation(schoolId, dto);
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
    const subjLockKey = buildSubjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);
    const armLockKey = buildClassArmLockKey(schoolId, dto.classArmId, dto.termId);

    return this.prisma.$transaction(
      async (tx) => {
        // Term-level lock FIRST, always — same fixed order close()/unlock()/
        // relock() use for THEIR only lock (SPEC_V0.5.md §2.3, step 3).
        // Serializes this save against a concurrent close/unlock/relock so
        // the closed-term check just below can never read a stale value —
        // whichever transaction gets here first fully commits before the
        // other's read runs, closing the race a pre-transaction check would
        // leave open. v0.7: the SAME term lock guards both the evaluation
        // and exam tracks — a closed term blocks editing either.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${termLock}))`;

        // Fresh read, not the `term` object from resolveTenantScopeWithEvaluation
        // above (fetched before this lock — could be stale by now). Outer
        // gate: fires before the PUBLISHED-lock below, and deliberately
        // doesn't relax it — an unlock grants "may edit this slice," not
        // "may also bypass the separate publish safeguard" (docs/DECISIONS.md).
        const freshTerm = await tx.term.findUniqueOrThrow({ where: { id: dto.termId } });
        const { locked } = await resolveSliceLockState(tx, {
          termId: dto.termId,
          classArmId: dto.classArmId,
          subjectId: dto.subjectId,
          closedAt: freshTerm.closedAt,
        });
        if (locked) {
          // Structured, same precedent as publishedLockException below — the
          // grid renders this state from load (EvaluationScoresResponse.locked),
          // so reaching this 409 in practice means a race (the term closed
          // or was relocked while this save was already in flight).
          throw new ConflictException({
            message: "This term is closed. Ask your principal/proprietor to unlock this class and subject before editing.",
            termLocked: true,
          });
        }

        // Serializes concurrent grid saves for the same subject+class+term
        // (SPEC_V0.4.md §5) — without this, two overlapping saves could
        // both read evaluation_scores before either commits and produce a
        // lost update on the derived total_score.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjLockKey}))`;

        // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — the lock is now the
        // EVALUATION's own published state, not a per-student subject-
        // level status: evaluation-publish is atomic across its whole
        // roster, so there's no per-student Set anymore, just one
        // boolean. SCHOOL_ADMIN/PROPRIETOR may still bypass to correct an
        // already-published evaluation (SPEC_V0.5.1.md §2.5's original
        // reasoning carried over, just re-scoped); TEACHER still 409s
        // unconditionally. The term-closed check above is untouched and
        // still applies to everyone, admin included.
        const evaluationRow = await tx.evaluation.findUniqueOrThrow({ where: { id: dto.evaluationId } });
        const isEvaluationPublished = evaluationRow.status === ResultStatus.PUBLISHED;
        const isPublishedBypassAllowed = user.role === UserRole.SCHOOL_ADMIN || user.role === UserRole.PROPRIETOR;
        if (isEvaluationPublished && !isPublishedBypassAllowed) {
          throw this.publishedLockException("save scores", affectedStudentIds);
        }
        const isBypassedPublishedEdit = isEvaluationPublished && isPublishedBypassAllowed;

        const existingResults = await tx.termSubjectResult.findMany({
          where: {
            studentId: { in: affectedStudentIds },
            subjectId: dto.subjectId,
            termId: dto.termId,
            sessionId: term.sessionId,
          },
        });

        // Gap #2 (docs/DECISIONS.md): a student's overall can only be
        // PUBLISHED if every subject they've been scored in so far is
        // itself PUBLISHED. So the only way an ORDINARY save can strand a
        // stale overall is by creating a genuinely NEW subject-result (no
        // existing row) for a student whose overall is currently
        // PUBLISHED.
        const studentsWithNoExistingRow = affectedStudentIds.filter(
          (id) => !existingResults.some((r) => r.studentId === id),
        );
        let needsOverallRecompute = false;
        if (studentsWithNoExistingRow.length > 0) {
          const overallRows = await tx.termOverallResult.findMany({
            where: { studentId: { in: studentsWithNoExistingRow }, termId: dto.termId, sessionId: term.sessionId },
          });
          needsOverallRecompute = overallRows.some((r) => r.status === ResultStatus.PUBLISHED);
        }
        // A bypassed edit to an already-published evaluation changes
        // scores that currently DO count toward the subject total — that
        // student's overall (and, once the subject re-ranks below,
        // possibly every other published student's overall too) needs the
        // same cross-subject cascade gap #2 already triggers this lock for.
        if (isBypassedPublishedEdit) {
          needsOverallRecompute = true;
        }

        await Promise.all(
          dto.scores.map((item) => {
            const rawScore = item.rawScore ?? null;
            // Always explicit, never a partial update — same discipline as
            // rawScore itself. A student marked absent last save who gets a
            // real score entered this save must have isAbsent flipped back
            // to false in the SAME write, or a stale isAbsent: true would
            // survive alongside the new rawScore and violate
            // evaluation_scores_raw_score_or_absent_check on this very row.
            // Symmetric the other way too: marking absent must null out any
            // prior rawScore.
            const isAbsent = item.isAbsent ?? false;
            return tx.evaluationScore.upsert({
              where: {
                evaluationId_studentId: { evaluationId: dto.evaluationId, studentId: item.studentId },
              },
              update: { rawScore, isAbsent, enteredBy: user.userId, enteredAt: new Date() },
              create: {
                evaluationId: dto.evaluationId,
                studentId: item.studentId,
                rawScore,
                isAbsent,
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

        // A bypassed edit's total just moved, which can shift the
        // relative rank of every OTHER already-published student in this
        // subject too, not just the ones just saved — same re-rank
        // publishEvaluation() itself does after transitioning an
        // evaluation to PUBLISHED (identical computeStandardCompetitionRanking
        // call), just triggered here by a correction instead of a fresh
        // publish. Still under the subject lock already held above; no
        // new lock needed for a single subject's own rows.
        if (isBypassedPublishedEdit) {
          const publishedRows = await tx.termSubjectResult.findMany({
            where: { schoolId, classArmId: dto.classArmId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId, status: ResultStatus.PUBLISHED },
          });
          const ranking = computeStandardCompetitionRanking(publishedRows, (row) => Number(row.totalScore));
          await Promise.all(
            ranking.map(({ item, position }) => tx.termSubjectResult.update({ where: { id: item.id }, data: { subjectPosition: position } })),
          );
        }

        // Class-arm lock ALWAYS after the subject lock, never before —
        // same fixed order publish()/unpublish() already use, so no
        // caller can deadlock against another (only ever contend ON the
        // class-arm lock itself, never hold it while trying to acquire a
        // different subject lock). Only acquired when genuinely needed
        // (gap #2, see above) — the normal save path never touches it.
        if (needsOverallRecompute) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${armLockKey}))`;
          await this.recomputeOverallForClassArm(tx, {
            schoolId,
            classArmId: dto.classArmId,
            termId: dto.termId,
            sessionId: term.sessionId,
          });
        }

        // One row for the whole bulk save, not one per score.
        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "grades.saveEvaluationScores",
            entityType: "grades",
            entityId: dto.classArmId,
            metadata: {
              subjectId: dto.subjectId,
              evaluationId: dto.evaluationId,
              termId: dto.termId,
              scoreCount: dto.scores.length,
              // Empty for every ordinary save — only non-empty when
              // admin/proprietor corrected an already-published
              // evaluation's score/absence, so this specific sensitive
              // path stays traceable in the same audit row rather than a
              // silent side effect of a routine save.
              publishedBypassStudentIds: isBypassedPublishedEdit ? affectedStudentIds : [],
            },
          },
        });

        const rawByStudent = new Map(dto.scores.map((s) => [s.studentId, s.rawScore ?? null]));
        const absentByStudent = new Map(dto.scores.map((s) => [s.studentId, s.isAbsent ?? false]));
        return {
          classArmId: dto.classArmId,
          subjectId: dto.subjectId,
          evaluationId: dto.evaluationId,
          termId: dto.termId,
          savedCount: dto.scores.length,
          rows: recomputed.map((r) => ({
            studentId: r.studentId,
            rawScore: rawByStudent.get(r.studentId) ?? null,
            isAbsent: absentByStudent.get(r.studentId) ?? false,
            totalScore: r.totalScore,
            autoGrade: r.autoGrade,
            finalGrade: r.finalGrade,
            status: r.status,
          })),
        };
      },
      { timeout: 20000 }, // was 15000 — bumped to match publish()'s budget for the same added class-arm-wide phase (only spent when needsOverallRecompute fires)
    );
  }

  // v0.7 step 2 (SPEC_V0.7.md §3): the evaluation picker's data source.
  // Same tenant-scope + teacher-assignment gate as score entry (reusing
  // assertTeacherAssignment, NOT the broader resolveTeacherAccess — this
  // is an authoring action, not a read-visibility one, confirmed). Also
  // surfaces the slice's lock state so the frontend can show a blocked
  // "+ New evaluation" affordance BEFORE the teacher opens the form, not
  // as a bare 409 after submitting (docs/DECISIONS.md).
  async listEvaluations(query: GetEvaluationsQueryDto, user: AuthenticatedUser): Promise<EvaluationsListResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeSubjectOnly(this.prisma, schoolId, query);
    await assertTeacherAssignment(this.prisma, schoolId, user, query.subjectId, query.classArmId, term.sessionId);

    const [evaluations, lockState] = await Promise.all([
      this.prisma.evaluation.findMany({
        where: { schoolId, classArmId: query.classArmId, subjectId: query.subjectId, termId: query.termId, deletedAt: null },
        orderBy: { createdAt: "asc" },
      }),
      resolveSliceLockState(this.prisma, {
        termId: query.termId,
        classArmId: query.classArmId,
        subjectId: query.subjectId,
        closedAt: term.closedAt,
      }),
    ]);

    return {
      classArmId: query.classArmId,
      subjectId: query.subjectId,
      termId: query.termId,
      termClosed: term.closedAt !== null,
      locked: lockState.locked,
      unlockReason: lockState.unlockReason,
      evaluations: evaluations.map((e) => this.toEvaluationResponse(e)),
    };
  }

  // Create: TEACHER (must hold the assignment)/SCHOOL_ADMIN/PROPRIETOR,
  // matching the scoring endpoint's own role list (confirmed — an admin
  // stepping in for a teacher can author too). Term-lock first (shared
  // with the exam track, same key order as saveEvaluationScores).
  // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — the old "subject already
  // published blocks creating a new evaluation" gate is REMOVED: that
  // was a consequence of subject-publish being the only publish unit
  // (adding an evaluation to an already-published subject meant
  // resurrecting a declared-final state). With publish per-evaluation,
  // this is now the normal case — add CA3 while CA1 is already published
  // and visible; CA3 just starts as its own fresh, unpublished evaluation
  // and doesn't disturb CA1's derived contribution at all.
  async createEvaluation(dto: CreateEvaluationDto, user: AuthenticatedUser): Promise<EvaluationResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeSubjectOnly(this.prisma, schoolId, dto);
    await assertTeacherAssignment(this.prisma, schoolId, user, dto.subjectId, dto.classArmId, term.sessionId);

    const termLock = termLockKey(schoolId, dto.termId);
    const subjLockKey = buildSubjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);

    return this.prisma.$transaction(
      async (tx) => {
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

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjLockKey}))`;

        const evaluation = await tx.evaluation.create({
          data: {
            schoolId,
            classArmId: dto.classArmId,
            subjectId: dto.subjectId,
            sessionId: term.sessionId,
            termId: dto.termId,
            name: dto.name,
            description: dto.description,
            createdBy: user.userId,
          },
        });

        return this.toEvaluationResponse(evaluation);
      },
      { timeout: 10000 },
    );
  }

  // Edit name/description only (classArmId/subjectId/termId are immutable
  // — re-scoping isn't a "fix a typo" edit). Freely editable while THIS
  // evaluation is DRAFT; once IT is PUBLISHED, only PROPRIETOR may edit —
  // same data-dependent role-narrowing shape override() already uses,
  // just re-scoped from "the subject" to "this evaluation" (v0.7.4 step 1,
  // SPEC_V0.7.4.md §2/§6): a sibling evaluation's publish state has no
  // bearing on this one anymore. No recompute needed: name/description
  // never feed the average.
  async updateEvaluation(evaluationId: string, dto: UpdateEvaluationDto, user: AuthenticatedUser): Promise<EvaluationResponse> {
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException("At least one of name or description must be provided.");
    }

    const schoolId = this.tenantContext.schoolId;
    const evaluation = await this.prisma.evaluation.findFirst({ where: forSchool(schoolId, { id: evaluationId, deletedAt: null }) });
    if (!evaluation) {
      throw new NotFoundException("Evaluation not found.");
    }
    await assertTeacherAssignment(this.prisma, schoolId, user, evaluation.subjectId, evaluation.classArmId, evaluation.sessionId);

    const termLock = termLockKey(schoolId, evaluation.termId);
    const subjLockKey = buildSubjectLockKey(schoolId, evaluation.subjectId, evaluation.classArmId, evaluation.termId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${termLock}))`;

      const freshTerm = await tx.term.findUniqueOrThrow({ where: { id: evaluation.termId } });
      const { locked } = await resolveSliceLockState(tx, {
        termId: evaluation.termId,
        classArmId: evaluation.classArmId,
        subjectId: evaluation.subjectId,
        closedAt: freshTerm.closedAt,
      });
      if (locked) {
        throw new ConflictException({
          message: "This term is closed. Ask your principal/proprietor to unlock this class and subject before editing.",
          termLocked: true,
        });
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjLockKey}))`;

      const freshEvaluation = await tx.evaluation.findUniqueOrThrow({ where: { id: evaluationId } });
      if (freshEvaluation.status === ResultStatus.PUBLISHED && user.role !== UserRole.PROPRIETOR) {
        throw new ForbiddenException("Only the school owner (PROPRIETOR) may edit an evaluation once it's published.");
      }

      const updated = await tx.evaluation.update({
        where: { id: evaluationId },
        data: {
          name: dto.name ?? evaluation.name,
          description: dto.description ?? evaluation.description,
        },
      });

      return this.toEvaluationResponse(updated);
    });
  }

  // PROPRIETOR only, categorical (enforced at the controller, mirrors
  // unpublishEvaluation() exactly — not data-dependent). Blocks outright
  // (409) while THIS evaluation is PUBLISHED — confirmed: no force-delete-
  // through-published cascade (v0.7.4 step 1: re-scoped from "the
  // subject" to "this evaluation" — a sibling's publish state has no
  // bearing here). This is why the recompute below can be a plain
  // recomputeStudents() call with no gap-2/overall cascade: this
  // evaluation is guaranteed DRAFT at delete-time (the block above), so
  // deleting it can only ever REMOVE a (non-counting) contribution, never
  // flip anyone's derived status. A future change that allows force-
  // deleting a PUBLISHED evaluation MUST add that cascade back
  // (docs/DECISIONS.md).
  async deleteEvaluation(evaluationId: string): Promise<{ id: string }> {
    const schoolId = this.tenantContext.schoolId;
    const evaluation = await this.prisma.evaluation.findFirst({ where: forSchool(schoolId, { id: evaluationId, deletedAt: null }) });
    if (!evaluation) {
      throw new NotFoundException("Evaluation not found.");
    }

    const students = await getRoster(this.prisma, schoolId, evaluation.classArmId, evaluation.sessionId);
    const studentIds = students.map((s) => s.id);

    const termLock = termLockKey(schoolId, evaluation.termId);
    const subjLockKey = buildSubjectLockKey(schoolId, evaluation.subjectId, evaluation.classArmId, evaluation.termId);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${termLock}))`;

        const freshTerm = await tx.term.findUniqueOrThrow({ where: { id: evaluation.termId } });
        const { locked } = await resolveSliceLockState(tx, {
          termId: evaluation.termId,
          classArmId: evaluation.classArmId,
          subjectId: evaluation.subjectId,
          closedAt: freshTerm.closedAt,
        });
        if (locked) {
          throw new ConflictException({
            message: "This term is closed. Ask your principal/proprietor to unlock this class and subject before editing.",
            termLocked: true,
          });
        }

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjLockKey}))`;

        const freshEvaluation = await tx.evaluation.findUniqueOrThrow({ where: { id: evaluationId } });
        if (freshEvaluation.status === ResultStatus.PUBLISHED) {
          throw new ConflictException("Cannot delete: this evaluation is already published — unpublish it first.");
        }

        await tx.evaluation.update({ where: { id: evaluationId }, data: { deletedAt: new Date() } });

        if (studentIds.length > 0) {
          await this.recomputeStudents(
            tx,
            { schoolId, subjectId: evaluation.subjectId, termId: evaluation.termId, sessionId: evaluation.sessionId, classArmId: evaluation.classArmId },
            studentIds,
          );
        }
      },
      { timeout: 20000 },
    );

    return { id: evaluationId };
  }

  private toEvaluationResponse(evaluation: Evaluation): EvaluationResponse {
    return {
      id: evaluation.id,
      name: evaluation.name,
      description: evaluation.description,
      status: evaluation.status,
      publishedAt: evaluation.publishedAt,
      createdAt: evaluation.createdAt,
      createdBy: evaluation.createdBy,
    };
  }

  // Admin-only manual re-trigger — re-derives term_subject_results for a
  // whole class arm + subject + term from whatever evaluation_scores/
  // evaluation publish-state currently exist, e.g. after a roster fix.
  // No new computation logic: same recomputeStudents() saveEvaluationScores()
  // already uses. v0.7.4 step 1 (SPEC_V0.7.4.md §2) — the old "409 if any
  // student's row is already published" block is REMOVED: that block
  // existed because a recompute could otherwise silently overwrite a
  // deliberately-declared-final subject-publish. There's no such
  // externally-declared state left to protect — recompute never touches
  // evaluation_scores or any evaluation's own publish status, it only
  // re-derives the SAME way a publish/unpublish/save already would, so
  // it's always safe to re-run regardless of current status. A necessary
  // consequence of that unblocking: recomputeStudents() always nulls
  // subjectPosition (ranking is the caller's job) — now that this can run
  // against an already-published subject, recompute() must re-rank the
  // currently-published set afterward itself, the same way
  // publishEvaluation()/unpublishEvaluation() do, or a manual re-trigger
  // would silently wipe every published student's position.
  //
  // Gap-2-twin (SPEC_V0.5.md §3): carried the same latent gap #2
  // saveEvaluationScores() is fixed for. Mirrors that fix exactly:
  // conditional class-arm lock ALWAYS after the subject lock, same fixed
  // order, only acquired when a real candidate exists. NOT gated by the
  // closed-term/unlock check below (docs/DECISIONS.md) — this only
  // re-derives from evaluation_scores rows that already passed that gate
  // at write time, introduces no new data, and stays off the term-lock
  // entirely, preserving the existing no-deadlock argument.
  async recompute(dto: RecomputeGradesDto): Promise<{ recomputedCount: number }> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeSubjectOnly(this.prisma, schoolId, dto);

    const students = await getRoster(this.prisma, schoolId, dto.classArmId, term.sessionId);
    const studentIds = students.map((s) => s.id);
    if (studentIds.length === 0) {
      return { recomputedCount: 0 };
    }

    const lockKey = buildSubjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);
    const armLockKey = buildClassArmLockKey(schoolId, dto.classArmId, dto.termId);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const existingResults = await tx.termSubjectResult.findMany({
          where: { studentId: { in: studentIds }, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId },
        });

        const studentsWithNoExistingRow = studentIds.filter((id) => !existingResults.some((r) => r.studentId === id));
        let needsOverallRecompute = false;
        if (studentsWithNoExistingRow.length > 0) {
          const overallRows = await tx.termOverallResult.findMany({
            where: { studentId: { in: studentsWithNoExistingRow }, termId: dto.termId, sessionId: term.sessionId },
          });
          needsOverallRecompute = overallRows.some((r) => r.status === ResultStatus.PUBLISHED);
        }

        const recomputed = await this.recomputeStudents(
          tx,
          { schoolId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId, classArmId: dto.classArmId },
          studentIds,
        );

        // Re-rank the ENTIRE currently-published set for this subject —
        // same as publishEvaluation()/unpublishEvaluation() do, and for
        // the same reason: recomputeStudents() always nulls
        // subjectPosition, so anyone currently published needs a fresh
        // rank or they'd silently lose their position. A no-op (zero
        // rows) when nothing's published.
        const publishedRows = await tx.termSubjectResult.findMany({
          where: { schoolId, classArmId: dto.classArmId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId, status: ResultStatus.PUBLISHED },
        });
        const ranking = computeStandardCompetitionRanking(publishedRows, (row) => Number(row.totalScore));
        await Promise.all(
          ranking.map(({ item, position }) => tx.termSubjectResult.update({ where: { id: item.id }, data: { subjectPosition: position } })),
        );

        if (needsOverallRecompute) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${armLockKey}))`;
          await this.recomputeOverallForClassArm(tx, {
            schoolId,
            classArmId: dto.classArmId,
            termId: dto.termId,
            sessionId: term.sessionId,
          });
        }

        return { recomputedCount: recomputed.length };
      },
      { timeout: 20000 }, // was 15000 — bumped to match saveGrid's budget for the same added class-arm-wide phase (only spent when needsOverallRecompute fires)
    );
  }

  // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — replaces subject-level publish().
  // Publishing THIS evaluation makes its scores visible to students/
  // parents (getReportCard's evaluations query, self-view, filters to
  // status: PUBLISHED) and re-derives every roster student's subject
  // total/status from whichever evaluations are currently published
  // (recomputeStudents) — the subject itself has no publish action of
  // its own anymore; re-ranks the ENTIRE currently-published set for this
  // subject, same as old publish() did, since one evaluation publishing
  // can shift everyone's relative total. Role shape carried over
  // unchanged from v0.7.3 (Item 4's admin-narrowing is a later step, not
  // this one): TEACHER (assigned) + SCHOOL_ADMIN + PROPRIETOR.
  async publishEvaluation(evaluationId: string, user: AuthenticatedUser): Promise<PublishEvaluationResponse> {
    const schoolId = this.tenantContext.schoolId;
    const evaluation = await this.prisma.evaluation.findFirst({ where: forSchool(schoolId, { id: evaluationId, deletedAt: null }) });
    if (!evaluation) {
      throw new NotFoundException("Evaluation not found.");
    }
    await assertTeacherAssignmentForPublish(this.prisma, schoolId, user, evaluation.subjectId, evaluation.classArmId, evaluation.sessionId);

    // Fetched before the transaction — same established convention as
    // deleteEvaluation (roster doesn't change within one request's
    // lifetime; getRoster is typed for PrismaService, not a tx client).
    const students = await getRoster(this.prisma, schoolId, evaluation.classArmId, evaluation.sessionId);
    const studentIds = students.map((s) => s.id);

    const termLock = termLockKey(schoolId, evaluation.termId);
    const subjectLockKey = buildSubjectLockKey(schoolId, evaluation.subjectId, evaluation.classArmId, evaluation.termId);
    const classArmLockKey = buildClassArmLockKey(schoolId, evaluation.classArmId, evaluation.termId);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${termLock}))`;
        const freshTerm = await tx.term.findUniqueOrThrow({ where: { id: evaluation.termId } });
        const { locked } = await resolveSliceLockState(tx, {
          termId: evaluation.termId,
          classArmId: evaluation.classArmId,
          subjectId: evaluation.subjectId,
          closedAt: freshTerm.closedAt,
        });
        if (locked) {
          throw new ConflictException({
            message: "This term is closed. Ask your principal/proprietor to unlock this class and subject before editing.",
            termLocked: true,
          });
        }

        // Subject-level lock first (same key saveEvaluationScores/
        // recompute/override use) — blocks a concurrent score save on
        // this exact grid from racing the publish. Always before the
        // broader class-arm lock below, never the reverse (SPEC_V0.4.md §5).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjectLockKey}))`;

        const freshEvaluation = await tx.evaluation.findUniqueOrThrow({ where: { id: evaluationId } });
        if (freshEvaluation.status === ResultStatus.PUBLISHED) {
          throw new ConflictException("This evaluation is already published.");
        }

        // Completeness gate (Q2) — every roster student needs a decided
        // (score-or-absent) row for THIS evaluation, not every evaluation
        // for the subject. Simpler than the old subject-scoped check it
        // replaces: one evaluation, the whole roster.
        const incompleteStudentIds = await this.findIncompleteStudentsForEvaluation(tx, evaluationId, studentIds);
        if (incompleteStudentIds.length > 0) {
          throw new ConflictException({
            message: `Cannot publish: ${incompleteStudentIds.length} student(s) don't have a score or absence recorded for this evaluation yet.`,
            incompleteStudentIds,
          });
        }

        await tx.evaluation.update({ where: { id: evaluationId }, data: { status: ResultStatus.PUBLISHED, publishedAt: new Date() } });

        await this.recomputeStudents(
          tx,
          { schoolId, subjectId: evaluation.subjectId, termId: evaluation.termId, sessionId: evaluation.sessionId, classArmId: evaluation.classArmId },
          studentIds,
        );

        // Re-rank the ENTIRE currently-published set for this subject —
        // mirrors old publish()'s own re-rank exactly, just triggered by
        // an evaluation publishing instead of a subject-publish action.
        const publishedRows = await tx.termSubjectResult.findMany({
          where: {
            schoolId,
            classArmId: evaluation.classArmId,
            subjectId: evaluation.subjectId,
            termId: evaluation.termId,
            sessionId: evaluation.sessionId,
            status: ResultStatus.PUBLISHED,
          },
        });
        const ranking = computeStandardCompetitionRanking(publishedRows, (row) => Number(row.totalScore));
        await Promise.all(
          ranking.map(({ item, position }) => tx.termSubjectResult.update({ where: { id: item.id }, data: { subjectPosition: position } })),
        );

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "grades.publishEvaluation",
            entityType: "grades",
            entityId: evaluation.classArmId,
            metadata: { subjectId: evaluation.subjectId, evaluationId, termId: evaluation.termId, publishedCount: studentIds.length },
          },
        });

        // Broader lock for the cross-subject overall recompute — same
        // reasoning old publish() used: a concurrent publish for a
        // DIFFERENT subject of this same class arm/term could otherwise
        // read stale term_subject_results and miss flipping a student's
        // overall. Unconditional (not gap-2-gated) — publishing an
        // evaluation always has the potential to change subject statuses.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${classArmLockKey}))`;
        const overall = await this.recomputeOverallForClassArm(tx, {
          schoolId,
          classArmId: evaluation.classArmId,
          termId: evaluation.termId,
          sessionId: evaluation.sessionId,
        });

        return {
          evaluationId,
          classArmId: evaluation.classArmId,
          subjectId: evaluation.subjectId,
          termId: evaluation.termId,
          publishedCount: studentIds.length,
          subjectPositions: ranking.map(({ item, position }) => ({
            studentId: item.studentId,
            totalScore: Number(item.totalScore),
            finalGrade: item.finalGrade,
            subjectPosition: position,
          })),
          overallPublishedCount: overall.publishedCount,
        };
      },
      { timeout: 20000 },
    );
  }

  // v0.7.4 step 1 — replaces subject-level unpublish(). Reverts THIS
  // evaluation to DRAFT and re-derives the subject's total/status from
  // whichever OTHER evaluations remain published — unlike old unpublish()
  // (which reverted the whole subject to DRAFT, since it was the only
  // publish unit), a subject with other published evaluations STAYS
  // derived-PUBLISHED here, just with a recalculated total that no
  // longer includes this one. Role shape carried over unchanged from
  // v0.7.3: TEACHER (assigned) + PROPRIETOR — SCHOOL_ADMIN still
  // excluded, unchanged asymmetry with publish.
  async unpublishEvaluation(evaluationId: string, user: AuthenticatedUser): Promise<UnpublishEvaluationResponse> {
    const schoolId = this.tenantContext.schoolId;
    const evaluation = await this.prisma.evaluation.findFirst({ where: forSchool(schoolId, { id: evaluationId, deletedAt: null }) });
    if (!evaluation) {
      throw new NotFoundException("Evaluation not found.");
    }
    await assertTeacherAssignmentForPublish(this.prisma, schoolId, user, evaluation.subjectId, evaluation.classArmId, evaluation.sessionId);

    // Fetched before the transaction — same convention as
    // publishEvaluation/deleteEvaluation.
    const students = await getRoster(this.prisma, schoolId, evaluation.classArmId, evaluation.sessionId);
    const studentIds = students.map((s) => s.id);

    const termLock = termLockKey(schoolId, evaluation.termId);
    const subjectLockKey = buildSubjectLockKey(schoolId, evaluation.subjectId, evaluation.classArmId, evaluation.termId);
    const classArmLockKey = buildClassArmLockKey(schoolId, evaluation.classArmId, evaluation.termId);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${termLock}))`;
        const freshTerm = await tx.term.findUniqueOrThrow({ where: { id: evaluation.termId } });
        const { locked } = await resolveSliceLockState(tx, {
          termId: evaluation.termId,
          classArmId: evaluation.classArmId,
          subjectId: evaluation.subjectId,
          closedAt: freshTerm.closedAt,
        });
        if (locked) {
          throw new ConflictException({
            message: "This term is closed. Ask your principal/proprietor to unlock this class and subject before editing.",
            termLocked: true,
          });
        }

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjectLockKey}))`;

        const freshEvaluation = await tx.evaluation.findUniqueOrThrow({ where: { id: evaluationId } });
        if (freshEvaluation.status !== ResultStatus.PUBLISHED) {
          throw new ConflictException("Nothing to unpublish: this evaluation isn't published.");
        }

        await tx.evaluation.update({ where: { id: evaluationId }, data: { status: ResultStatus.DRAFT, publishedAt: null } });

        await this.recomputeStudents(
          tx,
          { schoolId, subjectId: evaluation.subjectId, termId: evaluation.termId, sessionId: evaluation.sessionId, classArmId: evaluation.classArmId },
          studentIds,
        );

        // Re-rank whatever's STILL published for this subject after
        // removing this evaluation's contribution — the subject may
        // remain PUBLISHED (other evaluations still published) with a
        // shifted total, not necessarily revert to DRAFT entirely.
        const publishedRows = await tx.termSubjectResult.findMany({
          where: {
            schoolId,
            classArmId: evaluation.classArmId,
            subjectId: evaluation.subjectId,
            termId: evaluation.termId,
            sessionId: evaluation.sessionId,
            status: ResultStatus.PUBLISHED,
          },
        });
        const ranking = computeStandardCompetitionRanking(publishedRows, (row) => Number(row.totalScore));
        await Promise.all(
          ranking.map(({ item, position }) => tx.termSubjectResult.update({ where: { id: item.id }, data: { subjectPosition: position } })),
        );

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "grades.unpublishEvaluation",
            entityType: "grades",
            entityId: evaluation.classArmId,
            metadata: { subjectId: evaluation.subjectId, evaluationId, termId: evaluation.termId },
          },
        });

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${classArmLockKey}))`;
        const overall = await this.recomputeOverallForClassArm(tx, {
          schoolId,
          classArmId: evaluation.classArmId,
          termId: evaluation.termId,
          sessionId: evaluation.sessionId,
        });

        return {
          evaluationId,
          classArmId: evaluation.classArmId,
          subjectId: evaluation.subjectId,
          termId: evaluation.termId,
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
  // while DRAFT: the total isn't final pre-publish, so a stored override
  // would silently strand itself on an incomplete number —
  // recomputeStudents enforces the same invariant on the way back down
  // (unpublish reverting to DRAFT nulls any stored override, not just
  // leaves it stale).
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

    const lockKey = buildSubjectLockKey(schoolId, row.subjectId, row.classArmId, row.termId);

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
            "Cannot override: this subject hasn't been published yet. Override is available once the result is published.",
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

  // Class-wide results table for staff (SPEC_V0.4.md §2) — powers the
  // grades overview UI and, unfiltered for admin/owner, doubles as the
  // future report-card generation source. TEACHER visibility uses the one
  // unifying rule shared with getStudentResults() below: class-teacher of
  // this arm/session sees every subject and the overall column; a
  // subject-only teacher sees just their own subject(s) and no overall
  // column (that aggregates data across subjects they don't teach). Every
  // read here is a single batched findMany over the whole class arm/term —
  // no loop issuing one query per subject or per student (SPEC_V0.4.md §5).
  async getClassArmResults(
    classArmId: string,
    query: GetClassArmResultsQueryDto,
    user: AuthenticatedUser,
  ): Promise<ClassArmResultsResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeArmTermOnly(this.prisma, schoolId, classArmId, query.termId);

    let visibleSubjectIds: Set<string> | null = null; // null = no filter (admin/owner/class-teacher)
    let includeOverall = true;
    if (user.role === UserRole.TEACHER) {
      const access = await resolveTeacherAccess(this.prisma, { schoolId, teacherUserId: user.userId, classArmId, sessionId: term.sessionId });
      if (!access.isClassTeacher && access.subjectIds.length === 0) {
        throw new ForbiddenException("You are not assigned to this class.");
      }
      includeOverall = access.isClassTeacher;
      visibleSubjectIds = access.isClassTeacher ? null : new Set(access.subjectIds);
    }

    const [students, subjectResults, overallResults, boundaries, assignedSubjects] = await Promise.all([
      getRoster(this.prisma, schoolId, classArmId, term.sessionId),
      this.prisma.termSubjectResult.findMany({
        where: { schoolId, classArmId, termId: query.termId, sessionId: term.sessionId },
        include: { subject: { select: { id: true, name: true } } },
      }),
      includeOverall
        ? this.prisma.termOverallResult.findMany({
            where: { schoolId, classArmId, termId: query.termId, sessionId: term.sessionId },
          })
        : Promise.resolve(null),
      this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } }),
      getAssignedSubjectMap(this.prisma, { schoolId, classArmId, sessionId: term.sessionId }),
    ]);
    const boundaryInputs: GradeBoundaryInput[] = boundaries.map((b) => ({ grade: b.grade, minScore: b.minScore, maxScore: b.maxScore }));
    const studentOrder = new Map(students.map((s, index) => [s.id, index]));

    const bySubject = new Map<string, { name: string; rows: typeof subjectResults }>();
    for (const row of subjectResults) {
      if (visibleSubjectIds && !visibleSubjectIds.has(row.subjectId)) continue;
      const bucket = bySubject.get(row.subjectId) ?? { name: row.subject.name, rows: [] };
      bucket.rows.push(row);
      bySubject.set(row.subjectId, bucket);
    }

    const subjects: ClassArmResultsSubject[] = [...bySubject.entries()]
      .map(([subjectId, { name, rows }]) => {
        const averageScore = computeOverallAverage(rows.map((r) => Number(r.totalScore)));
        return {
          subjectId,
          subjectName: name,
          // SPEC_V0.5.1.md §2.1/Q1(b): a subject that already has real
          // grades never gets hidden, but if there's no current
          // subject_teacher_assignment for it, it's surfaced as needing
          // one rather than shown as if everything is normal.
          needsTeacherAssignment: !assignedSubjects.has(subjectId),
          averageScore,
          averageGrade: resolveGradeBand(averageScore, boundaryInputs),
          results: rows
            .map((r) => ({
              id: r.id,
              studentId: r.studentId,
              totalScore: Number(r.totalScore),
              autoGrade: r.autoGrade,
              overrideGrade: r.overrideGrade,
              finalGrade: r.finalGrade,
              subjectPosition: r.subjectPosition,
              status: r.status,
            }))
            .sort((a, b) => (studentOrder.get(a.studentId) ?? 0) - (studentOrder.get(b.studentId) ?? 0)),
        };
      })
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

    return {
      classArmId,
      termId: query.termId,
      students: students.map((s) => ({ studentId: s.id, firstName: s.firstName, lastName: s.lastName, admissionNumber: s.admissionNumber })),
      subjects,
      overall: overallResults
        ? overallResults
            .map((o) => ({
              studentId: o.studentId,
              averageScore: Number(o.averageScore),
              averageGrade: o.averageGrade,
              overallPosition: o.overallPosition,
              status: o.status,
              subjectsCount: o.subjectsCount,
            }))
            .sort((a, b) => (studentOrder.get(a.studentId) ?? 0) - (studentOrder.get(b.studentId) ?? 0))
        : null,
    };
  }

  // v0.7.4 step 1 (SPEC_V0.7.4.md §2, §8 of the approved plan) — Director/
  // owner READ-ONLY oversight view (SPEC_V0.4.md §2's original purpose,
  // narrowed): no more `canPublish`/publish button — there is no subject-
  // level publish action to gate anymore. Publish/unpublish now happens
  // per evaluation, on the Grades-page Enter-scores surface, not here.
  // A subject's state is still returned as COUNTS, not one status:
  // recomputeStudents' per-student derivation means stragglers can stay
  // DRAFT after their classmates are already PUBLISHED for the very same
  // subject, so draft/published can genuinely coexist for one subject.
  // No TEACHER path at all — SCHOOL_ADMIN/PROPRIETOR only, enforced by
  // @Roles() at the controller. pendingApprovalCount is always 0 for the
  // evaluation track (unchanged from before this step) — kept for shape
  // stability, since PENDING_APPROVAL is still meaningful at the
  // cross-subject term_overall_results level (computeOverallStatus).
  async getReview(query: GetGradesReviewQueryDto): Promise<GradesReviewResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeArmTermOnly(this.prisma, schoolId, query.classArmId, query.termId);

    const [students, subjectResults, boundaries, assignedSubjects] = await Promise.all([
      getRoster(this.prisma, schoolId, query.classArmId, term.sessionId),
      this.prisma.termSubjectResult.findMany({
        where: { schoolId, classArmId: query.classArmId, termId: query.termId, sessionId: term.sessionId },
        include: { subject: { select: { id: true, name: true } } },
      }),
      this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } }),
      getAssignedSubjectMap(this.prisma, { schoolId, classArmId: query.classArmId, sessionId: term.sessionId }),
    ]);
    const boundaryInputs: GradeBoundaryInput[] = boundaries.map((b) => ({ grade: b.grade, minScore: b.minScore, maxScore: b.maxScore }));
    const rosterSize = students.length;

    const bySubject = new Map<string, { name: string; rows: typeof subjectResults }>();
    for (const row of subjectResults) {
      const bucket = bySubject.get(row.subjectId) ?? { name: row.subject.name, rows: [] };
      bucket.rows.push(row);
      bySubject.set(row.subjectId, bucket);
    }

    const bySubjectEntries = [...bySubject.entries()];

    let subjects: GradesReviewSubject[] = bySubjectEntries.map(([subjectId, { name, rows }]) => {
      const draftCount = rows.filter((r) => r.status === ResultStatus.DRAFT).length;
      const pendingApprovalCount = rows.filter((r) => r.status === ResultStatus.PENDING_APPROVAL).length;
      const publishedCount = rows.filter((r) => r.status === ResultStatus.PUBLISHED).length;
      const averageScore = computeOverallAverage(rows.map((r) => Number(r.totalScore)));
      return {
        subjectId,
        subjectName: name,
        needsTeacherAssignment: !assignedSubjects.has(subjectId),
        rosterSize,
        draftCount,
        pendingApprovalCount,
        publishedCount,
        averageScore,
        averageGrade: resolveGradeBand(averageScore, boundaryInputs),
      };
    });

    // "At least one student in this status" — a subject's state is a
    // breakdown, not a single value (see the doc comment above), so this
    // is the only filter semantic that makes sense here.
    if (query.status) {
      subjects = subjects.filter((s) =>
        query.status === ResultStatus.DRAFT
          ? s.draftCount > 0
          : query.status === ResultStatus.PENDING_APPROVAL
            ? s.pendingApprovalCount > 0
            : s.publishedCount > 0,
      );
    }

    subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName));

    return { classArmId: query.classArmId, termId: query.termId, subjects };
  }

  // One student's results across subjects for a term (SPEC_V0.4.md §2) —
  // the Results tab. TEACHER access uses the SAME unifying rule as
  // getClassArmResults() above, but consumed differently: there it filters
  // WHICH subjects render; here it's a plain allow/deny — once a teacher
  // has any relationship to this student's class arm (class-teacher of it,
  // or any subject assignment there), they see the student's FULL results,
  // all subjects, not just their own lane. Deliberately looser than the
  // class-arm overview: this is "do I know this student", not "which
  // subjects in this shared classroom screen are mine". Cross-tenant/
  // missing-resource 404s always resolve before this check.
  //
  // Class averages come from a SQL-side groupBy _avg over just the
  // student's own subject IDs — not a full class-arm fetch (that's
  // getClassArmResults()'s job) and not one query per subject.
  async getStudentResults(
    studentId: string,
    query: GetStudentResultsQueryDto,
    user: AuthenticatedUser,
  ): Promise<StudentResultsResponse> {
    const schoolId = this.tenantContext.schoolId;
    const [student, term] = await Promise.all([
      this.prisma.student.findFirst({ where: forSchool(schoolId, { id: studentId, deletedAt: null }) }),
      this.prisma.term.findFirst({ where: forSchool(schoolId, { id: query.termId }) }),
    ]);
    if (!student) throw new NotFoundException("Student not found.");
    if (!term) throw new NotFoundException("Term not found.");

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: forSchool(schoolId, { studentId, sessionId: query.sessionId }),
    });
    if (!enrollment) throw new NotFoundException("Student has no enrollment for this session.");

    if (user.role === UserRole.TEACHER) {
      const access = await resolveTeacherAccess(this.prisma, { schoolId, teacherUserId: user.userId, classArmId: enrollment.classArmId, sessionId: query.sessionId });
      if (!access.isClassTeacher && access.subjectIds.length === 0) {
        throw new ForbiddenException("You do not teach this student.");
      }
    }

    const [subjectResults, overall, boundaries, assignedSubjects] = await Promise.all([
      this.prisma.termSubjectResult.findMany({
        where: { schoolId, studentId, termId: query.termId, sessionId: query.sessionId },
        include: { subject: { select: { id: true, name: true } } },
      }),
      this.prisma.termOverallResult.findFirst({ where: { schoolId, studentId, termId: query.termId, sessionId: query.sessionId } }),
      this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } }),
      getAssignedSubjectMap(this.prisma, { schoolId, classArmId: enrollment.classArmId, sessionId: query.sessionId }),
    ]);
    const boundaryInputs: GradeBoundaryInput[] = boundaries.map((b) => ({ grade: b.grade, minScore: b.minScore, maxScore: b.maxScore }));

    let classAverageBySubject = new Map<string, number>();
    if (subjectResults.length > 0) {
      const classAverages = await this.prisma.termSubjectResult.groupBy({
        by: ["subjectId"],
        where: {
          schoolId,
          classArmId: enrollment.classArmId,
          termId: query.termId,
          sessionId: query.sessionId,
          subjectId: { in: subjectResults.map((r) => r.subjectId) },
        },
        _avg: { totalScore: true },
      });
      classAverageBySubject = new Map(classAverages.map((c) => [c.subjectId, Number(c._avg.totalScore ?? 0)]));
    }

    const subjects: StudentResultSubject[] = subjectResults
      .map((r) => {
        const classAverageScore = Math.round((classAverageBySubject.get(r.subjectId) ?? 0) * 100) / 100;
        return {
          subjectId: r.subjectId,
          subjectName: r.subject.name,
          needsTeacherAssignment: !assignedSubjects.has(r.subjectId),
          totalScore: Number(r.totalScore),
          autoGrade: r.autoGrade,
          overrideGrade: r.overrideGrade,
          finalGrade: r.finalGrade,
          classAverageScore,
          classAverageGrade: resolveGradeBand(classAverageScore, boundaryInputs),
          subjectPosition: r.subjectPosition,
          status: r.status,
        };
      })
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

    return {
      studentId,
      termId: query.termId,
      sessionId: query.sessionId,
      subjects,
      overall: overall
        ? {
            averageScore: Number(overall.averageScore),
            averageGrade: overall.averageGrade,
            overallPosition: overall.overallPosition,
            status: overall.status,
            subjectsCount: overall.subjectsCount,
          }
        : null,
    };
  }

  // Printable per-student term report card (SPEC_V0.5.md §2.4, v0.5 step 4)
  // — a NEW, dedicated response shape, not an extension of
  // StudentResultsResponse above: the two documents need genuinely
  // different fields (this one needs the full per-component breakdown and
  // has no use for class average; the Results tab is the reverse), and a
  // printable document's needs should be free to evolve without leaking
  // into the admin quick-view's contract. Reuses the exact same tenant/
  // enrollment/TEACHER-access resolution as getStudentResults() above —
  // same read rule (any relationship to the class arm), not the stricter
  // class-teacher-only rule the remark WRITE endpoints below use.
  //
  // v0.7 step 4 (SPEC_V0.7.md §4): `evaluations` (per subject) is now real —
  // name/description/score for every Evaluation feeding that subject's
  // totalScore. Every OTHER field (totalScore/autoGrade/finalGrade/
  // subjectPosition/status, overall, remarks, the whole publish-filtering
  // contract) is unchanged from step 1.
  async getReportCard(studentId: string, query: GetStudentResultsQueryDto, user: AuthenticatedUser): Promise<ReportCardResponse> {
    const schoolId = this.tenantContext.schoolId;
    const [student, term] = await Promise.all([
      this.prisma.student.findFirst({ where: forSchool(schoolId, { id: studentId, deletedAt: null }) }),
      this.prisma.term.findFirst({ where: forSchool(schoolId, { id: query.termId }) }),
    ]);
    if (!student) throw new NotFoundException("Student not found.");
    if (!term) throw new NotFoundException("Term not found.");

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: forSchool(schoolId, { studentId, sessionId: query.sessionId }),
    });
    if (!enrollment) throw new NotFoundException("Student has no enrollment for this session.");

    if (user.role === UserRole.TEACHER) {
      const access = await resolveTeacherAccess(this.prisma, { schoolId, teacherUserId: user.userId, classArmId: enrollment.classArmId, sessionId: query.sessionId });
      if (!access.isClassTeacher && access.subjectIds.length === 0) {
        throw new ForbiddenException("You do not teach this student.");
      }
    }

    // v0.6 steps 3+4 (SPEC_V0.6.md §2.3/§2.4): a STUDENT or PARENT reading
    // a child's OWN report card (via MeService — studentId here is always
    // a student the caller is entitled to, resolved/validated from the
    // token before this method is ever called, never a raw request param)
    // sees ONLY what publish() has already finalized. No new "published"
    // concept: this is the exact ResultStatus.PUBLISHED the staff publish
    // flow already sets on term_subject_results, and computeOverallStatus()
    // already guarantees term_overall_results only ever reaches PUBLISHED
    // once EVERY one of that student's subjects for the term is itself
    // PUBLISHED (grade-computation.ts) — so filtering subjects to
    // PUBLISHED and overall to PUBLISHED can never disagree with each
    // other. A draft/pending/absent-but-unpublished subject is excluded
    // here at the query level — it never reaches the `subjects` array
    // below, not just a hidden field on it. No separate self-id check is
    // added here: the only callers that can ever pass role STUDENT/PARENT
    // are MeService's student and parent paths, which resolve/validate
    // studentId from the JWT subject's own user.studentId (STUDENT) or
    // against the caller's own linked-children set (PARENT) BEFORE calling
    // this method — never from a field on `query` — so there is no
    // "wrong" studentId this branch could be asked to defend against.
    const publishedOnlyForSelfView = user.role === UserRole.STUDENT || user.role === UserRole.PARENT;

    const [subjectResults, overall, remark, assignedSubjects] = await Promise.all([
      this.prisma.termSubjectResult.findMany({
        where: {
          schoolId,
          studentId,
          termId: query.termId,
          sessionId: query.sessionId,
          ...(publishedOnlyForSelfView ? { status: ResultStatus.PUBLISHED } : {}),
        },
        include: { subject: { select: { id: true, name: true } } },
      }),
      this.prisma.termOverallResult.findFirst({
        where: {
          schoolId,
          studentId,
          termId: query.termId,
          sessionId: query.sessionId,
          ...(publishedOnlyForSelfView ? { status: ResultStatus.PUBLISHED } : {}),
        },
      }),
      this.prisma.termRemark.findFirst({
        where: { schoolId, studentId, termId: query.termId, sessionId: query.sessionId },
        include: {
          teacherRemarkByUser: { select: { firstName: true, lastName: true } },
          principalRemarkByUser: { select: { firstName: true, lastName: true } },
        },
      }),
      getAssignedSubjectMap(this.prisma, { schoolId, classArmId: enrollment.classArmId, sessionId: query.sessionId }),
    ]);

    // Remarks travel with the finalized card, not ahead of it: a STUDENT
    // only sees teacher/principal remarks once the term's OVERALL result
    // is itself published (approved decision, v0.6 step 3) — showing a
    // remark before the term's results are actually out would contradict
    // "only what's been made final."
    const remarksVisibleToCaller = !publishedOnlyForSelfView || overall !== null;

    // v0.7 step 4 (SPEC_V0.7.md §4) — the published-only wall for the
    // evaluation breakdown. The wall above (the `status: PUBLISHED` filter
    // baked into subjectResults' own `where`, not a post-fetch check) has
    // ALREADY decided which subjectIds a STUDENT/PARENT caller is allowed
    // to see. Scoping this query to exactly those surviving subjectIds
    // means an unpublished subject's evaluations are never queried at all —
    // there is no row to leak, not a row that's fetched and then hidden.
    //
    // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — THE LEAK FIX. Pre-v0.7.4,
    // `Evaluation` carried no publish state of its own, so subject-level
    // scoping alone was sufficient: every evaluation under a visible
    // subject was itself implicitly "published" (publish was a subject-wide
    // action). Now that publish is per-evaluation and a subject counts as
    // PUBLISHED once it has >=1 published evaluation, a visible subject can
    // still have an UNPUBLISHED sibling evaluation — without this filter,
    // that sibling's scores would leak to the student/parent the moment
    // any one of its subject's evaluations goes live. Same conditional
    // `status: PUBLISHED` gate as every other publishedOnlyForSelfView
    // branch in this method.
    const visibleSubjectIds = subjectResults.map((r) => r.subjectId);
    const evaluations =
      visibleSubjectIds.length > 0
        ? await this.prisma.evaluation.findMany({
            where: {
              schoolId,
              classArmId: enrollment.classArmId,
              subjectId: { in: visibleSubjectIds },
              termId: query.termId,
              deletedAt: null,
              ...(publishedOnlyForSelfView ? { status: ResultStatus.PUBLISHED } : {}),
            },
            orderBy: { createdAt: "asc" },
          })
        : [];
    const evaluationIds = evaluations.map((e) => e.id);
    const evaluationScores =
      evaluationIds.length > 0
        ? await this.prisma.evaluationScore.findMany({ where: { evaluationId: { in: evaluationIds }, studentId } })
        : [];
    const scoreByEvaluation = new Map(evaluationScores.map((s) => [s.evaluationId, s]));
    const evaluationsBySubject = new Map<string, typeof evaluations>();
    for (const e of evaluations) {
      const arr = evaluationsBySubject.get(e.subjectId) ?? [];
      arr.push(e);
      evaluationsBySubject.set(e.subjectId, arr);
    }

    // v0.7 step 5 (SPEC_V0.7.md §4) — comparative analytics, batched (one
    // extra query per level, never per-subject/per-evaluation). Subject-
    // level class average reuses getStudentResults()'s exact groupBy
    // pattern, extended with the missing publish gate that method never
    // needed (it's staff-only). Per-evaluation stats need a JOIN-shaped
    // filter no groupBy can express — Evaluation/EvaluationScore carry no
    // publish state of their own, only the PARENT subject's
    // term_subject_result.status does, PER STUDENT — so eligibility is
    // resolved as a studentId allow-list per subject first, then applied
    // in JS via computeAssessmentClassStats. `null` allow-list (staff)
    // means every classmate's row counts regardless of publish state.
    // v0.7.3 step 2 (SPEC_V0.7.3.md §3) — every PUBLISHED term_subject_result
    // in this class arm/term, unfiltered by subject and not grouped by the
    // DB: runningClassAverageScore/runningPosition need each STUDENT's own
    // running average first (group-by-student, then average/rank those),
    // which no existing groupBy/aggregate query here can produce — those
    // all operate per-subject or across the whole class arm at once, never
    // per-student. Same unconditional `status: PUBLISHED` gate every other
    // class figure in this method uses (not the publishedOnlyForSelfView-
    // branched kind) — an unpublished subject/classmate is never fetched,
    // structurally, matching runningAverageScore's own gate above.
    const [classAveragesBySubject, publishedRowsForEligibility, allEvaluationScores, overallClassAvg, allPublishedResultsForArm] = await Promise.all([
      visibleSubjectIds.length > 0
        ? this.prisma.termSubjectResult.groupBy({
            by: ["subjectId"],
            where: {
              schoolId,
              classArmId: enrollment.classArmId,
              termId: query.termId,
              sessionId: query.sessionId,
              subjectId: { in: visibleSubjectIds },
              ...(publishedOnlyForSelfView ? { status: ResultStatus.PUBLISHED } : {}),
            },
            _avg: { totalScore: true },
          })
        : [],
      publishedOnlyForSelfView && visibleSubjectIds.length > 0
        ? this.prisma.termSubjectResult.findMany({
            where: {
              schoolId,
              classArmId: enrollment.classArmId,
              termId: query.termId,
              sessionId: query.sessionId,
              subjectId: { in: visibleSubjectIds },
              status: ResultStatus.PUBLISHED,
            },
            select: { subjectId: true, studentId: true },
          })
        : [],
      evaluationIds.length > 0
        ? this.prisma.evaluationScore.findMany({
            where: { evaluationId: { in: evaluationIds } },
            select: { evaluationId: true, studentId: true, rawScore: true, isAbsent: true },
          })
        : [],
      this.prisma.termOverallResult.aggregate({
        where: {
          schoolId,
          classArmId: enrollment.classArmId,
          termId: query.termId,
          sessionId: query.sessionId,
          ...(publishedOnlyForSelfView ? { status: ResultStatus.PUBLISHED } : {}),
        },
        _avg: { averageScore: true },
      }),
      this.prisma.termSubjectResult.findMany({
        where: { schoolId, classArmId: enrollment.classArmId, termId: query.termId, sessionId: query.sessionId, status: ResultStatus.PUBLISHED },
        select: { studentId: true, totalScore: true },
      }),
    ]);
    const classAverageBySubjectId = new Map(
      classAveragesBySubject.map((c) => [c.subjectId, c._avg.totalScore === null ? null : Math.round(Number(c._avg.totalScore) * 100) / 100]),
    );
    const eligibleStudentIdsBySubject = new Map<string, Set<string>>();
    for (const row of publishedRowsForEligibility) {
      const set = eligibleStudentIdsBySubject.get(row.subjectId) ?? new Set<string>();
      set.add(row.studentId);
      eligibleStudentIdsBySubject.set(row.subjectId, set);
    }
    const classScoresByEvaluationId = new Map<string, typeof allEvaluationScores>();
    for (const s of allEvaluationScores) {
      const arr = classScoresByEvaluationId.get(s.evaluationId) ?? [];
      arr.push(s);
      classScoresByEvaluationId.set(s.evaluationId, arr);
    }
    const generalClassAverage =
      overallClassAvg._avg.averageScore === null ? null : Math.round(Number(overallClassAvg._avg.averageScore) * 100) / 100;

    // v0.7.2 step 1 (SPEC_V0.7.2.md §2/§5 step 1) — Pronote-style running
    // average: a NEW, ADDITIVE, on-read figure computed from published
    // subjects so far, entirely independent of term_overall_results. It
    // is deliberately NOT gated behind `overall` being non-null — that's
    // the whole point (it's what fills in while `overall` is still null
    // mid-term). Reuses `subjectResults`, already fetched above with the
    // same publish gate; for a self-view caller that array is ALREADY
    // published-only, so this filter is a no-op there and a real
    // narrowing for staff (who fetch every status) — one code path
    // covers both, no new query, no write, no touch to
    // recomputeOverallForClassArm or any of its four call sites.
    const publishedSubjectResults = subjectResults.filter((r) => r.status === ResultStatus.PUBLISHED);
    const runningAverageScore =
      publishedSubjectResults.length > 0 ? computeOverallAverage(publishedSubjectResults.map((r) => Number(r.totalScore))) : null;

    // v0.7.3 step 2 (SPEC_V0.7.3.md §3) — the class-wide companions:
    // group the whole class arm's PUBLISHED rows (fetched above) by
    // student, run each student's own totals through the SAME
    // computeOverallAverage runningAverageScore itself uses (one pure
    // function, reused twice — once per student, once again across
    // students), then rank that same per-student map with the SAME
    // computeStandardCompetitionRanking publish()/recomputeOverallForClassArm
    // already use. This pool is "≥1 subject published" — deliberately
    // looser than, and entirely separate from, recomputeOverallForClassArm's
    // fully-published-only pool that feeds the official overallPosition;
    // neither reads nor writes term_overall_results.
    const totalsByStudent = new Map<string, number[]>();
    for (const row of allPublishedResultsForArm) {
      const arr = totalsByStudent.get(row.studentId) ?? [];
      arr.push(Number(row.totalScore));
      totalsByStudent.set(row.studentId, arr);
    }
    const runningAverageByStudent = new Map<string, number>(
      [...totalsByStudent.entries()].map(([sid, totals]) => [sid, computeOverallAverage(totals)]),
    );
    const runningClassAverageScore =
      runningAverageByStudent.size > 0 ? computeOverallAverage([...runningAverageByStudent.values()]) : null;
    const runningRanking = computeStandardCompetitionRanking(
      [...runningAverageByStudent.entries()],
      ([, avg]) => avg,
    );
    const runningPosition = runningRanking.find(({ item: [sid] }) => sid === studentId)?.position ?? null;

    const subjects: ReportCardSubject[] = subjectResults
      .map((r) => {
        const eligibleForSubject = publishedOnlyForSelfView ? (eligibleStudentIdsBySubject.get(r.subjectId) ?? new Set<string>()) : null;
        return {
          subjectId: r.subjectId,
          subjectName: r.subject.name,
          needsTeacherAssignment: !assignedSubjects.has(r.subjectId),
          evaluations: (evaluationsBySubject.get(r.subjectId) ?? []).map((e) => {
            const score = scoreByEvaluation.get(e.id);
            const classRows = classScoresByEvaluationId.get(e.id) ?? [];
            const stats = computeAssessmentClassStats(
              classRows.map((row) => ({ studentId: row.studentId, rawScore: row.rawScore === null ? null : Number(row.rawScore), isAbsent: row.isAbsent })),
              eligibleForSubject,
            );
            return {
              evaluationId: e.id,
              name: e.name,
              description: e.description,
              rawScore: score?.rawScore === null || score?.rawScore === undefined ? null : Number(score.rawScore),
              isAbsent: score?.isAbsent ?? false,
              classAverageScore: stats.classAverageScore,
              bestScore: stats.bestScore,
              worstScore: stats.worstScore,
            };
          }),
          totalScore: Number(r.totalScore),
          autoGrade: r.autoGrade,
          overrideGrade: r.overrideGrade,
          finalGrade: r.finalGrade,
          subjectPosition: r.subjectPosition,
          status: r.status,
          classAverageScore: classAverageBySubjectId.get(r.subjectId) ?? null,
        };
      })
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

    return {
      studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      classArmId: enrollment.classArmId,
      termId: query.termId,
      sessionId: query.sessionId,
      subjects,
      overall: overall
        ? {
            averageScore: Number(overall.averageScore),
            averageGrade: overall.averageGrade,
            overallPosition: overall.overallPosition,
            status: overall.status,
            subjectsCount: overall.subjectsCount,
            generalClassAverage,
          }
        : null,
      runningAverageScore,
      runningClassAverageScore,
      runningPosition,
      remarks: {
        teacherRemark: remarksVisibleToCaller ? (remark?.teacherRemark ?? null) : null,
        teacherRemarkBy:
          remarksVisibleToCaller && remark?.teacherRemarkByUser
            ? { firstName: remark.teacherRemarkByUser.firstName, lastName: remark.teacherRemarkByUser.lastName }
            : null,
        teacherRemarkAt: remarksVisibleToCaller ? (remark?.teacherRemarkAt ?? null) : null,
        principalRemark: remarksVisibleToCaller ? (remark?.principalRemark ?? null) : null,
        principalRemarkBy:
          remarksVisibleToCaller && remark?.principalRemarkByUser
            ? { firstName: remark.principalRemarkByUser.firstName, lastName: remark.principalRemarkByUser.lastName }
            : null,
        principalRemarkAt: remarksVisibleToCaller ? (remark?.principalRemarkAt ?? null) : null,
      },
    };
  }

  // Both remark endpoints (SPEC_V0.5.md §2.4/Q6) share this resolution —
  // student/term/enrollment 404s always before the class-teacher check
  // (same ordering as getStudentResults/getReportCard above). Returns the
  // enrollment so callers can read classArmId for the term_remarks row
  // without a second query.
  private async resolveRemarkTarget(studentId: string, dto: WriteRemarkDto) {
    const schoolId = this.tenantContext.schoolId;
    const [student, term] = await Promise.all([
      this.prisma.student.findFirst({ where: forSchool(schoolId, { id: studentId, deletedAt: null }) }),
      this.prisma.term.findFirst({ where: forSchool(schoolId, { id: dto.termId }) }),
    ]);
    if (!student) throw new NotFoundException("Student not found.");
    if (!term) throw new NotFoundException("Term not found.");

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: forSchool(schoolId, { studentId, sessionId: dto.sessionId }),
    });
    if (!enrollment) throw new NotFoundException("Student has no enrollment for this session.");

    return { schoolId, enrollment };
  }

  // Class-teacher-only (SPEC_V0.5.md §2.4/Q6: "the class teacher writes the
  // teacher remark") — deliberately STRICTER than getReportCard()'s read
  // rule above, which allows any subject-teacher relationship. A
  // subject-only teacher can view the card but not write this remark.
  // SCHOOL_ADMIN/PROPRIETOR: no check, same "any tenant-scoped combo"
  // pattern used throughout this service. Not gated by the step-3 closed-
  // term/unlock mechanism — that gate is score-data-scoped; writing an
  // end-of-term remark is part of closing out the term, not a score edit
  // (docs/DECISIONS.md).
  async writeTeacherRemark(studentId: string, dto: WriteRemarkDto, user: AuthenticatedUser): Promise<RemarkResponse> {
    const { schoolId, enrollment } = await this.resolveRemarkTarget(studentId, dto);

    if (user.role === UserRole.TEACHER) {
      const access = await resolveTeacherAccess(this.prisma, { schoolId, teacherUserId: user.userId, classArmId: enrollment.classArmId, sessionId: dto.sessionId });
      if (!access.isClassTeacher) {
        throw new ForbiddenException("Only this class's class teacher may write the teacher remark.");
      }
    }

    const stamps =
      dto.remark === null
        ? { teacherRemark: null, teacherRemarkBy: null, teacherRemarkAt: null }
        : { teacherRemark: dto.remark, teacherRemarkBy: user.userId, teacherRemarkAt: new Date() };

    return this.prisma.termRemark.upsert({
      where: { studentId_termId_sessionId: { studentId, termId: dto.termId, sessionId: dto.sessionId } },
      update: stamps,
      create: { schoolId, studentId, termId: dto.termId, sessionId: dto.sessionId, classArmId: enrollment.classArmId, ...stamps },
    });
  }

  // SCHOOL_ADMIN/PROPRIETOR only — enforced categorically at the
  // controller's @Roles(), TEACHER never reaches this method at all (same
  // "no TEACHER path" pattern as getReview()). Not gated by closed-term/
  // unlock, same reasoning as writeTeacherRemark() above.
  async writePrincipalRemark(studentId: string, dto: WriteRemarkDto, user: AuthenticatedUser): Promise<RemarkResponse> {
    const { schoolId, enrollment } = await this.resolveRemarkTarget(studentId, dto);

    const stamps =
      dto.remark === null
        ? { principalRemark: null, principalRemarkBy: null, principalRemarkAt: null }
        : { principalRemark: dto.remark, principalRemarkBy: user.userId, principalRemarkAt: new Date() };

    return this.prisma.termRemark.upsert({
      where: { studentId_termId_sessionId: { studentId, termId: dto.termId, sessionId: dto.sessionId } },
      update: stamps,
      create: { schoolId, studentId, termId: dto.termId, sessionId: dto.sessionId, classArmId: enrollment.classArmId, ...stamps },
    });
  }

  // Re-derives term_subject_results for each given student from ALL of
  // their current evaluation_scores across EVERY active Evaluation for
  // (classArmId, subjectId, termId) — not just whichever evaluation
  // triggered this call — using computeEvaluationAverage
  // (grade-computation.ts). Callers must have already verified none of
  // these students' existing results are PUBLISHED; this function does
  // not re-check (and is safe to call on a formerly-published row
  // transitioning OUT of PUBLISHED, e.g. from unpublish() — that's the
  // one case where a row IS published going in).
  //
  // v0.7 step 1 (confirmed): no auto-status-flip. A freshly-created row
  // starts DRAFT; publish() is the ONLY thing that ever moves a row to
  // PUBLISHED. So every non-preserved row this function writes is DRAFT —
  // there's no computed intermediate status to derive anymore.
  // subject_position/published_at are unconditionally cleared for every
  // non-preserved row, same as before — publish() is the only place that
  // sets them, directly, after this function returns.
  //
  // v0.7.4 step 1 (SPEC_V0.7.4.md §2, Q1) — status/total are now DERIVED
  // from the subject's PUBLISHED evaluations, not passed in by the
  // caller. Only evaluations with their own status===PUBLISHED
  // contribute to the average — scoring a still-draft evaluation no
  // longer moves the subject total at all (the redesign's whole point:
  // the number reflects exactly what's been shown to the student).
  // A student counts PUBLISHED once they have at least one DECIDED
  // (real score or absent) row among those published evaluations — same
  // straggler philosophy subject-publish always had (a student with
  // zero decided rows among what's published stays DRAFT even while
  // classmates are PUBLISHED). override_grade is cleared whenever the
  // row is DRAFT, same as before. subjectPosition is always nulled here
  // and re-ranked by the caller immediately after (publishEvaluation/
  // unpublishEvaluation, or saveEvaluationScores' bypass path) — this
  // function's only job is deriving total/status/grade, never ranking.
  private async recomputeStudents(tx: Prisma.TransactionClient, ctx: RecomputeContext, studentIds: string[]): Promise<RecomputedRow[]> {
    const [evaluations, boundaries, existingRows] = await Promise.all([
      tx.evaluation.findMany({
        where: { schoolId: ctx.schoolId, classArmId: ctx.classArmId, subjectId: ctx.subjectId, termId: ctx.termId, deletedAt: null },
        select: { id: true, status: true },
      }),
      tx.gradeBoundary.findMany({ where: { schoolId: ctx.schoolId }, orderBy: { sortOrder: "asc" } }),
      tx.termSubjectResult.findMany({
        where: { studentId: { in: studentIds }, subjectId: ctx.subjectId, termId: ctx.termId, sessionId: ctx.sessionId },
      }),
    ]);
    const publishedEvaluationIds = evaluations.filter((e) => e.status === ResultStatus.PUBLISHED).map((e) => e.id);
    const boundaryInputs: GradeBoundaryInput[] = boundaries.map((b) => ({
      grade: b.grade,
      minScore: b.minScore,
      maxScore: b.maxScore,
    }));
    const existingOverrideByStudent = new Map(existingRows.map((r) => [r.studentId, r.overrideGrade]));
    const existingPublishedAtByStudent = new Map(existingRows.map((r) => [r.studentId, r.publishedAt]));

    // One batched query across every PUBLISHED evaluation for this
    // subject/term at once (not one query per student) — grouped by
    // studentId in memory.
    const allScores =
      publishedEvaluationIds.length > 0
        ? await tx.evaluationScore.findMany({ where: { evaluationId: { in: publishedEvaluationIds }, studentId: { in: studentIds } } })
        : [];
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
      const hasDecidedPublishedRow = scoreInputs.some((s) => s.isAbsent || s.rawScore !== null);
      const status = hasDecidedPublishedRow ? ResultStatus.PUBLISHED : ResultStatus.DRAFT;
      const totalScore = computeEvaluationAverage(scoreInputs);
      const autoGrade = resolveGradeBand(totalScore, boundaryInputs);
      const overrideGrade = status === ResultStatus.DRAFT ? null : (existingOverrideByStudent.get(studentId) ?? null);
      const finalGrade = resolveFinalGrade(autoGrade, overrideGrade);
      // Preserve the ORIGINAL first-published timestamp across
      // subsequent recomputes (e.g. a second evaluation publishing
      // later) rather than resetting it every time; null once reverted
      // to DRAFT.
      const publishedAt = status === ResultStatus.PUBLISHED ? (existingPublishedAtByStudent.get(studentId) ?? new Date()) : null;

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
          publishedAt,
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
          publishedAt,
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

  // v0.7.4 step 1 (SPEC_V0.7.4.md §2, Q2) — the completeness gate moved
  // to evaluation granularity: replaces the old subject-scoped
  // findIncompleteEntries (which checked "every evaluation for a
  // subject, every candidate student"). This is simpler than what it
  // replaces — one evaluation, every roster student — because publish
  // is now per-evaluation, not per-subject. "Blank" = no evaluation_scores
  // row, or a row with rawScore IS NULL AND isAbsent = false (both
  // indistinguishable — both silently contribute nothing to the
  // average). Absent is NOT blank.
  private async findIncompleteStudentsForEvaluation(
    tx: Prisma.TransactionClient,
    evaluationId: string,
    studentIds: string[],
  ): Promise<string[]> {
    if (studentIds.length === 0) return [];
    const scores = await tx.evaluationScore.findMany({
      where: { evaluationId, studentId: { in: studentIds } },
    });
    const decided = new Set(
      scores.filter((s) => (s.rawScore !== null && s.rawScore !== undefined) || s.isAbsent).map((s) => s.studentId),
    );
    return studentIds.filter((id) => !decided.has(id));
  }

  // v0.7.4 step 1 — now exclusively saveEvaluationScores' lock (recompute()
  // no longer blocks on published status, see its own doc comment).
  // Structured, not just a count: the frontend's reactive fallback
  // (use-score-entry-save-queue.ts) needs to know exactly WHICH rows to
  // mark locked on a race, not just how many. Since evaluation-publish is
  // atomic across its whole roster, `lockedStudentIds` is always the
  // entire affected batch, not a filtered subset. AllExceptionsFilter
  // passes any extra fields on the exception's response payload through
  // the standard error envelope alongside statusCode/message/error/path/timestamp.
  private publishedLockException(action: string, lockedStudentIds: string[]): ConflictException {
    return new ConflictException({
      message: `Cannot ${action}: this evaluation's results are already published — unpublish it first.`,
      lockedStudentIds,
    });
  }

  private async resolveTenantScopeWithEvaluation(
    schoolId: string,
    ids: { classArmId: string; subjectId: string; evaluationId: string; termId: string },
  ): Promise<{ term: Term; evaluation: Evaluation }> {
    const [classArm, subject, term, evaluation] = await Promise.all([
      this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: ids.classArmId }) }),
      this.prisma.subject.findFirst({ where: forSchool(schoolId, { id: ids.subjectId, deletedAt: null }) }),
      this.prisma.term.findFirst({ where: forSchool(schoolId, { id: ids.termId }) }),
      this.prisma.evaluation.findFirst({
        where: forSchool(schoolId, {
          id: ids.evaluationId,
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
    if (!evaluation) throw new NotFoundException("Evaluation not found.");
    return { term, evaluation };
  }

}
