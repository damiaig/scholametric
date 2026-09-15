import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ResultStatus, UserRole, type Exam } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import {
  computeAssessmentClassStats,
  computeEvaluationAverage,
  computeOverallAverage,
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
  resolveTenantScopeArmTermOnly,
  assertTeacherAssignment,
} from "../grades/grade-shared.util";
import { resolveTeacherAccess } from "../grades/teacher-access.util";
import { getAssignedSubjectMap } from "../grades/subject-assignment.util";
import { GetExamScoresQueryDto } from "./dto/get-exam-scores-query.dto";
import { SaveExamScoresDto } from "./dto/save-exam-scores.dto";
import { RecomputeExamGradesDto } from "./dto/recompute-exam-grades.dto";
import { SubmitExamForApprovalDto } from "./dto/submit-exam-for-approval.dto";
import { ApproveExamDto } from "./dto/approve-exam.dto";
import { RejectExamDto } from "./dto/reject-exam.dto";
import { UnpublishExamGradesDto } from "./dto/unpublish-exam-grades.dto";
import { GetExamsQueryDto } from "./dto/get-exams-query.dto";
import { CreateExamDto } from "./dto/create-exam.dto";
import { UpdateExamDto } from "./dto/update-exam.dto";
import { GetStudentSubjectExamsQueryDto } from "./dto/get-student-subject-exams-query.dto";
import { GetYearExamsQueryDto } from "./dto/get-year-exams-query.dto";
import { GetExamsReviewQueryDto } from "./dto/get-exams-review-query.dto";

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

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — replaces PublishExamResponse.
// Submitting never cascades to TermExamResult/YearExamResult: those two
// only ever count PUBLISHED rows (recomputeExamOverallForClassArm's
// `allPublished` check, unchanged), and PENDING_APPROVAL isn't PUBLISHED —
// so there is nothing for a cascade to do here. submittedCount is always
// the whole roster's size, same reasoning as the evaluation track's
// publishedCount (SPEC_V0.7.4.md §2): the roster-wide completeness gate
// means every student is decided by the time this succeeds.
export interface SubmitExamForApprovalResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  submittedCount: number;
}

// Replaces PublishExamResponse's old direct-publish shape — this is now
// where the publish cascade actually lives (moved from the old publish()).
export interface ApproveExamResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  approvedCount: number;
  termExamPublishedCount: number;
  yearExamRecomputedCount: number;
}

// PENDING_APPROVAL -> DRAFT, bare state revert (no reason field — v0.7.4
// step 2 confirmed decision). No cascade: nothing pending was ever counted
// in TermExamResult/YearExamResult (both gate on PUBLISHED only), so
// there's nothing upstream to unwind.
export interface RejectExamResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  rejectedCount: number;
}

export interface UnpublishExamResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  unpublishedCount: number;
  termExamRevertedCount: number;
  yearExamRecomputedCount: number;
}

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — the admin pending-approvals surface,
// mirroring GradesReviewSubject/GradesReviewResponse exactly (grades.service.ts),
// source table swapped to term_subject_exam_result. Unlike the grades side
// (where pendingApprovalCount is permanently 0 post-v0.7.4 — that tier was
// retired there), this is exactly where PENDING_APPROVAL lives now.
export interface ExamReviewSubject {
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

export interface ExamReviewResponse {
  classArmId: string;
  termId: string;
  subjects: ExamReviewSubject[];
}

// v0.7 step 3 (SPEC_V0.7.md §3) — the authoring surface, mirroring
// EvaluationResponse/EvaluationsListResponse exactly except `name` is
// always resolved to a display string here (never null) — see
// toExamResponse's doc comment.
export interface ExamResponse {
  id: string;
  name: string;
  createdAt: Date;
  createdBy: string;
}

export interface ExamsListResponse {
  classArmId: string;
  subjectId: string;
  termId: string;
  termClosed: boolean;
  locked: boolean;
  unlockReason: string | null;
  exams: ExamResponse[];
}

// v0.7 step 3 (SPEC_V0.7.md §4) — one row per exam, for both the per-term
// "Show exams" panel and the year view's per-subject breakdown. v0.7
// step 5 adds comparative analytics (numbers only) — see
// computeAssessmentClassStats (grade-computation.ts) for the eligibility
// rule these three come from.
export interface StudentExamRow {
  examId: string;
  name: string;
  rawScore: number | null;
  isAbsent: boolean;
  classAverageScore: number | null;
  bestScore: number | null;
  worstScore: number | null;
}

// The per-term "Show exams" button's data (subject-scoped). For STUDENT/
// PARENT, if this subject's term_subject_exam_result isn't PUBLISHED,
// `exams` is [] and the averages are null — indistinguishable from
// "nothing entered yet," same posture as getReportCard's subjects array
// fully excluding non-published rows rather than exposing a hidden field.
export interface StudentSubjectExamsResponse {
  studentId: string;
  subjectId: string;
  subjectName: string;
  termId: string;
  sessionId: string;
  exams: StudentExamRow[];
  subjectExamAverage: number | null;
  subjectExamGrade: string | null;
  status: ResultStatus | null;
  classAverageScore: number | null;
}

export interface YearExamsTermSubject {
  subjectId: string;
  subjectName: string;
  exams: StudentExamRow[];
  subjectExamAverage: number | null;
  subjectExamGrade: string | null;
  classAverageScore: number | null;
}

export interface YearExamsTerm {
  termId: string;
  termName: string;
  subjects: YearExamsTermSubject[];
  termExamAverage: number | null;
  termExamGrade: string | null;
  termExamPosition: number | null;
  status: ResultStatus | null;
  classAverageScore: number | null;
}

// The dedicated year-long Exams view (SPEC_V0.7.md §4) — one entry per
// term the student was enrolled in this session (chronological, by
// term.startsOn), each with every subject's individual exams + that
// subject's average, the term's cross-subject average/position, and the
// whole-session overall at the end. Every level independently filtered
// to PUBLISHED for STUDENT/PARENT — a partially-published year shows only
// the terms/subjects that have actually been published, never a stale or
// premature number.
export interface YearExamsResponse {
  studentId: string;
  sessionId: string;
  terms: YearExamsTerm[];
  overallExamAverage: number | null;
  overallExamGrade: string | null;
  yearExamPosition: number | null;
  termsCount: number;
  overallStatus: ResultStatus | null;
  generalClassAverage: number | null;
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
        // v0.7.4 step 2 (SPEC_V0.7.4.md §3) — PENDING_APPROVAL locks writes
        // the same way PUBLISHED does: a subject sitting in the admin's
        // approval queue must not be editable out from under them (an
        // unblocked edit would silently un-submit it via
        // recomputeExamStudents' status derivation below, with no signal
        // to anyone, and would invalidate approve()'s assumption that
        // nothing changed since the completeness gate ran at submit time).
        // Same bypass roles as the PUBLISHED lock.
        const lockedResults = existingResults.filter(
          (r) => r.status === ResultStatus.PUBLISHED || r.status === ResultStatus.PENDING_APPROVAL,
        );
        const lockedStudentIds = lockedResults.map((r) => r.studentId);
        const isLockBypassAllowed = user.role === UserRole.SCHOOL_ADMIN || user.role === UserRole.PROPRIETOR;
        if (lockedStudentIds.length > 0 && !isLockBypassAllowed) {
          throw this.resultLockException("save scores", lockedStudentIds);
        }
        // Preserve each bypassed student's CURRENT locked status (PUBLISHED
        // or PENDING_APPROVAL) rather than forcing everyone toward
        // PUBLISHED — a bypass-edit during PENDING_APPROVAL stays
        // PENDING_APPROVAL, it doesn't jump the approval queue.
        const preserveStatusByStudentId = new Map<string, ResultStatus>(
          isLockBypassAllowed ? lockedResults.map((r) => [r.studentId, r.status]) : [],
        );

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
          preserveStatusByStudentId,
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
              // Renamed from publishedBypassStudentIds (v0.7.4 step 2) —
              // the bypass now covers PENDING_APPROVAL too, not just
              // PUBLISHED, so "published" alone would be a misleading name.
              lockBypassStudentIds: [...preserveStatusByStudentId.keys()],
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

  // v0.7 step 3 (SPEC_V0.7.md §3): the exam picker's data source. Mirrors
  // GradesService.listEvaluations exactly — assertTeacherAssignment (the
  // strict grade-entry gate, not the broader resolveTeacherAccess), and
  // the same lock-state contract so the frontend can render a blocked
  // "+ New exam" affordance BEFORE submit.
  async listExams(query: GetExamsQueryDto, user: AuthenticatedUser): Promise<ExamsListResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeSubjectOnly(this.prisma, schoolId, query);
    await assertTeacherAssignment(this.prisma, schoolId, user, query.subjectId, query.classArmId, term.sessionId);

    const [exams, lockState] = await Promise.all([
      this.prisma.exam.findMany({
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
      exams: exams.map((e) => this.toExamResponse(e)),
    };
  }

  // Create: TEACHER (must hold the assignment)/SCHOOL_ADMIN/PROPRIETOR,
  // matching the scoring endpoint's own role list — mirrors
  // GradesService.createEvaluation exactly, including the confirmed
  // "exam set frozen once published" rule: a subject whose exam results
  // are already PUBLISHED blocks a new exam (409) until unpublish-first.
  async createExam(dto: CreateExamDto, user: AuthenticatedUser): Promise<ExamResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeSubjectOnly(this.prisma, schoolId, dto);
    await assertTeacherAssignment(this.prisma, schoolId, user, dto.subjectId, dto.classArmId, term.sessionId);

    const termLock = termLockKey(schoolId, dto.termId);
    const subjLockKey = examSubjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);

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

        // v0.7.4 step 2 (SPEC_V0.7.4.md §3) — widened from PUBLISHED-only:
        // a new exam sneaking in while the subject is PENDING_APPROVAL
        // would change what the admin is about to approve without them
        // ever seeing the updated picture (and that new exam could never
        // be scored afterward either, since PUBLISHED locks writes) —
        // same reasoning as the score-entry lock above, applied to
        // authoring.
        const lockedCount = await tx.termSubjectExamResult.count({
          where: {
            schoolId,
            classArmId: dto.classArmId,
            subjectId: dto.subjectId,
            termId: dto.termId,
            sessionId: term.sessionId,
            status: { in: [ResultStatus.PUBLISHED, ResultStatus.PENDING_APPROVAL] },
          },
        });
        if (lockedCount > 0) {
          throw new ConflictException(
            "Cannot create: this subject's exam results are already published or pending approval for this term — resolve that first (unpublish, or wait for the pending decision) before adding a new exam.",
          );
        }

        const exam = await tx.exam.create({
          data: {
            schoolId,
            classArmId: dto.classArmId,
            subjectId: dto.subjectId,
            sessionId: term.sessionId,
            termId: dto.termId,
            name: dto.name ?? null,
            createdBy: user.userId,
          },
        });

        return this.toExamResponse(exam);
      },
      { timeout: 10000 },
    );
  }

  // Edit name only (classArmId/subjectId/termId are immutable). Freely
  // editable while this subject's exam results are DRAFT; once ANY row is
  // PUBLISHED for this subject/term, only PROPRIETOR may edit — mirrors
  // GradesService.updateEvaluation's data-dependent role-narrowing.
  async updateExam(examId: string, dto: UpdateExamDto, user: AuthenticatedUser): Promise<ExamResponse> {
    if (dto.name === undefined) {
      throw new BadRequestException("name must be provided.");
    }

    const schoolId = this.tenantContext.schoolId;
    const exam = await this.prisma.exam.findFirst({ where: forSchool(schoolId, { id: examId, deletedAt: null }) });
    if (!exam) {
      throw new NotFoundException("Exam not found.");
    }
    await assertTeacherAssignment(this.prisma, schoolId, user, exam.subjectId, exam.classArmId, exam.sessionId);

    const termLock = termLockKey(schoolId, exam.termId);
    const subjLockKey = examSubjectLockKey(schoolId, exam.subjectId, exam.classArmId, exam.termId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${termLock}))`;

      const freshTerm = await tx.term.findUniqueOrThrow({ where: { id: exam.termId } });
      const { locked } = await resolveSliceLockState(tx, {
        termId: exam.termId,
        classArmId: exam.classArmId,
        subjectId: exam.subjectId,
        closedAt: freshTerm.closedAt,
      });
      if (locked) {
        throw new ConflictException({
          message: "This term is closed. Ask your principal/proprietor to unlock this class and subject before editing.",
          termLocked: true,
        });
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjLockKey}))`;

      // v0.7.4 step 2 (SPEC_V0.7.4.md §3) — widened from PUBLISHED-only,
      // same reasoning as createExam's gate above.
      const lockedCount = await tx.termSubjectExamResult.count({
        where: {
          schoolId,
          classArmId: exam.classArmId,
          subjectId: exam.subjectId,
          termId: exam.termId,
          sessionId: exam.sessionId,
          status: { in: [ResultStatus.PUBLISHED, ResultStatus.PENDING_APPROVAL] },
        },
      });
      if (lockedCount > 0 && user.role !== UserRole.PROPRIETOR) {
        throw new ForbiddenException(
          "Only the school owner (PROPRIETOR) may edit an exam once this subject's results are published or pending approval.",
        );
      }

      const updated = await tx.exam.update({
        where: { id: examId },
        data: { name: dto.name ?? exam.name },
      });

      return this.toExamResponse(updated);
    });
  }

  // PROPRIETOR only, categorical (enforced at the controller, mirrors
  // unpublish() exactly). Blocks outright (409) while this subject's exam
  // results are PUBLISHED — no force-delete-through-published cascade.
  // Same reasoning as GradesService.deleteEvaluation, one level deeper:
  // since delete is blocked while published, the affected
  // term_subject_exam_result is guaranteed DRAFT, so neither
  // TermExamResult (per-term) nor YearExamResult (whole-session) could
  // already be PUBLISHED on the strength of this subject — no cascade to
  // either is needed. A future force-delete-through-published change MUST
  // add both back (docs/DECISIONS.md).
  async deleteExam(examId: string): Promise<{ id: string }> {
    const schoolId = this.tenantContext.schoolId;
    const exam = await this.prisma.exam.findFirst({ where: forSchool(schoolId, { id: examId, deletedAt: null }) });
    if (!exam) {
      throw new NotFoundException("Exam not found.");
    }

    const students = await getRoster(this.prisma, schoolId, exam.classArmId, exam.sessionId);
    const studentIds = students.map((s) => s.id);

    const termLock = termLockKey(schoolId, exam.termId);
    const subjLockKey = examSubjectLockKey(schoolId, exam.subjectId, exam.classArmId, exam.termId);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${termLock}))`;

        const freshTerm = await tx.term.findUniqueOrThrow({ where: { id: exam.termId } });
        const { locked } = await resolveSliceLockState(tx, {
          termId: exam.termId,
          classArmId: exam.classArmId,
          subjectId: exam.subjectId,
          closedAt: freshTerm.closedAt,
        });
        if (locked) {
          throw new ConflictException({
            message: "This term is closed. Ask your principal/proprietor to unlock this class and subject before editing.",
            termLocked: true,
          });
        }

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjLockKey}))`;

        // v0.7.4 step 2 (SPEC_V0.7.4.md §3) — widened from PUBLISHED-only,
        // same reasoning as createExam's gate above.
        const lockedCount = await tx.termSubjectExamResult.count({
          where: {
            schoolId,
            classArmId: exam.classArmId,
            subjectId: exam.subjectId,
            termId: exam.termId,
            sessionId: exam.sessionId,
            status: { in: [ResultStatus.PUBLISHED, ResultStatus.PENDING_APPROVAL] },
          },
        });
        if (lockedCount > 0) {
          throw new ConflictException(
            "Cannot delete: this subject's exam results are already published or pending approval for this term — resolve that first.",
          );
        }

        await tx.exam.update({ where: { id: examId }, data: { deletedAt: new Date() } });

        if (studentIds.length > 0) {
          await this.recomputeExamStudents(
            tx,
            { schoolId, subjectId: exam.subjectId, termId: exam.termId, sessionId: exam.sessionId, classArmId: exam.classArmId },
            studentIds,
          );
        }
      },
      { timeout: 20000 },
    );

    return { id: examId };
  }

  private toExamResponse(exam: Exam): ExamResponse {
    return {
      id: exam.id,
      // Optional at write-time — resolved to a display default here, the
      // one place null->"Exam" ever happens, so no caller needs to.
      name: exam.name ?? "Exam",
      createdAt: exam.createdAt,
      createdBy: exam.createdBy,
    };
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
        // v0.7.4 step 2 (SPEC_V0.7.4.md §3) — widened from PUBLISHED-only:
        // a manual recompute must not silently un-submit a PENDING_APPROVAL
        // subject either (recomputeExamStudents defaults to DRAFT unless
        // told to preserve, and recompute() never passes a preserve map —
        // it's a full categorical block here, no bypass, matching its
        // pre-existing PUBLISHED-only behavior just widened).
        const lockedStudentIds = existingResults
          .filter((r) => r.status === ResultStatus.PUBLISHED || r.status === ResultStatus.PENDING_APPROVAL)
          .map((r) => r.studentId);
        if (lockedStudentIds.length > 0) {
          throw this.resultLockException("recompute", lockedStudentIds);
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

  // v0.7.4 step 2 (SPEC_V0.7.4.md §3) — replaces publish(). Transitions a
  // subject's DRAFT exam results to PENDING_APPROVAL only — PUBLISHED is
  // now exclusively reached via approve() below, never directly from
  // here. TEACHER-only (enforced at the controller with a route-level
  // @Roles(TEACHER) override, no admin/proprietor in that list at all —
  // confirmed: admin's route to PUBLISHED is exclusively approve(), never
  // submit, so there is no self-submit-self-approve shape even
  // temporarily). No cascade: TermExamResult/YearExamResult only ever
  // count PUBLISHED rows (recomputeExamOverallForClassArm's `allPublished`
  // check, untouched) and PENDING_APPROVAL isn't PUBLISHED, so there is
  // nothing for a cascade to do until approve().
  //
  // Completeness gate (SPEC_V0.7.4.md §3 Q5) — ROSTER-WIDE, reusing the
  // evaluation track's Step 1 shape: every CURRENTLY enrolled student must
  // be decided on every active exam for this subject/term, not just
  // students who already happen to have a term_subject_exam_result row
  // (the old carve-out this replaces — see findIncompleteExamEntries).
  async submitForApproval(dto: SubmitExamForApprovalDto, user: AuthenticatedUser): Promise<SubmitExamForApprovalResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeSubjectOnly(this.prisma, schoolId, dto);
    await assertTeacherAssignment(this.prisma, schoolId, user, dto.subjectId, dto.classArmId, term.sessionId);

    // Fetched before the transaction — same convention as
    // GradesService.publishEvaluation (roster doesn't change within one
    // request's lifetime).
    const students = await getRoster(this.prisma, schoolId, dto.classArmId, term.sessionId);
    const studentIds = students.map((s) => s.id);

    const subjectLockKey = examSubjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjectLockKey}))`;

        const existing = await tx.termSubjectExamResult.findMany({
          where: { schoolId, classArmId: dto.classArmId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId },
        });
        const toSubmit = existing.filter((r) => r.status === ResultStatus.DRAFT);

        if (existing.length === 0) {
          throw new ConflictException("Nothing to submit for this subject: no exam scores have been entered yet.");
        }
        if (toSubmit.length === 0) {
          throw new ConflictException("This subject's exam results are already submitted for approval or published.");
        }

        const incomplete = await this.findIncompleteExamEntries(
          tx,
          { schoolId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId },
          studentIds,
        );
        if (incomplete.length > 0) {
          const incompleteStudentIds = [...new Set(incomplete.map((e) => e.studentId))];
          throw new ConflictException({
            message: `Cannot submit: ${incompleteStudentIds.length} student(s) don't have a score or absence recorded for every exam yet.`,
            incompleteStudentIds,
          });
        }

        await Promise.all(
          toSubmit.map((row) => tx.termSubjectExamResult.update({ where: { id: row.id }, data: { status: ResultStatus.PENDING_APPROVAL } })),
        );

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "exams.submitForApproval",
            entityType: "exams",
            entityId: dto.classArmId,
            metadata: { subjectId: dto.subjectId, termId: dto.termId, submittedCount: toSubmit.length },
          },
        });

        return {
          classArmId: dto.classArmId,
          subjectId: dto.subjectId,
          termId: dto.termId,
          submittedCount: toSubmit.length,
        };
      },
      { timeout: 20000 },
    );
  }

  // v0.7.4 step 2 — the only path to PUBLISHED now. Inherits publish()'s
  // old cascade (TermExamResult/YearExamResult) unchanged, just moved from
  // the old direct-publish call-site to here. No completeness re-check:
  // the roster-wide gate already ran at submit time, and the score-entry
  // lock (saveExamScores) now blocks further writes for the whole time
  // this subject sits PENDING_APPROVAL (SCHOOL_ADMIN/PROPRIETOR bypass
  // excepted, same as PUBLISHED) — so nothing could have changed
  // underneath since submit. SCHOOL_ADMIN + PROPRIETOR (SPEC_V0.7.4.md §3,
  // Item 4's "Admin/proprietor KEEP: approve exams", both roles).
  async approve(dto: ApproveExamDto, user: AuthenticatedUser): Promise<ApproveExamResponse> {
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
        const toApprove = existing.filter((r) => r.status === ResultStatus.PENDING_APPROVAL);
        if (toApprove.length === 0) {
          throw new ConflictException("Nothing to approve for this subject: no exam results are pending approval.");
        }

        const now = new Date();
        await Promise.all(
          toApprove.map((row) =>
            tx.termSubjectExamResult.update({ where: { id: row.id }, data: { status: ResultStatus.PUBLISHED, publishedAt: now } }),
          ),
        );

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "exams.approve",
            entityType: "exams",
            entityId: dto.classArmId,
            metadata: { subjectId: dto.subjectId, termId: dto.termId, approvedCount: toApprove.length },
          },
        });

        // Broader lock for the cross-subject term cascade — same reasoning
        // as the old publish()'s classArmLockKey acquisition.
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
          approvedCount: toApprove.length,
          termExamPublishedCount: termCascade.publishedCount,
          yearExamRecomputedCount: yearCascade.recomputedCount,
        };
      },
      { timeout: 20000 },
    );
  }

  // v0.7.4 step 2 — bare state revert (PENDING_APPROVAL -> DRAFT), no
  // reason field (confirmed: scope creep beyond the frozen five items).
  // No cascade — nothing pending was ever counted in TermExamResult/
  // YearExamResult (both gate on PUBLISHED only), so there's nothing
  // upstream to unwind. Same role list as approve (SCHOOL_ADMIN +
  // PROPRIETOR).
  async reject(dto: RejectExamDto, user: AuthenticatedUser): Promise<RejectExamResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeSubjectOnly(this.prisma, schoolId, dto);

    const subjectLockKey = examSubjectLockKey(schoolId, dto.subjectId, dto.classArmId, dto.termId);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjectLockKey}))`;

        const existing = await tx.termSubjectExamResult.findMany({
          where: { schoolId, classArmId: dto.classArmId, subjectId: dto.subjectId, termId: dto.termId, sessionId: term.sessionId },
        });
        const toReject = existing.filter((r) => r.status === ResultStatus.PENDING_APPROVAL);
        if (toReject.length === 0) {
          throw new ConflictException("Nothing to reject for this subject: no exam results are pending approval.");
        }

        await Promise.all(toReject.map((row) => tx.termSubjectExamResult.update({ where: { id: row.id }, data: { status: ResultStatus.DRAFT } })));

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: user.userId,
            action: "exams.reject",
            entityType: "exams",
            entityId: dto.classArmId,
            metadata: { subjectId: dto.subjectId, termId: dto.termId, rejectedCount: toReject.length },
          },
        });

        return {
          classArmId: dto.classArmId,
          subjectId: dto.subjectId,
          termId: dto.termId,
          rejectedCount: toReject.length,
        };
      },
      { timeout: 20000 },
    );
  }

  // Reverts a subject's PUBLISHED exam results back to DRAFT and cascades
  // the same two levels upward. v0.7.4 step 3 (SPEC_V0.7.4.md §4, Q6):
  // SCHOOL_ADMIN + PROPRIETOR both (widened from PROPRIETOR-only) — both
  // oversight roles keep exam-approval + unpublish; unlike the evaluation
  // track's unpublish (TEACHER + PROPRIETOR only), there's no teacher
  // authorship to balance here.
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

  // v0.7.4 step 2 (SPEC_V0.7.4.md §3) — the admin pending-approvals
  // surface, mirroring GradesService.getReview() exactly (grades.service.ts),
  // source table swapped to term_subject_exam_result. SCHOOL_ADMIN/
  // PROPRIETOR only (enforced at the controller — no TEACHER path, same as
  // the grades side). Unlike GradesService.getReview() post-v0.7.4 (where
  // pendingApprovalCount is permanently 0 — that tier was retired on the
  // grades side), this is exactly where PENDING_APPROVAL lives now.
  async getReview(query: GetExamsReviewQueryDto): Promise<ExamReviewResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await resolveTenantScopeArmTermOnly(this.prisma, schoolId, query.classArmId, query.termId);

    const [students, subjectResults, boundaries, assignedSubjects] = await Promise.all([
      getRoster(this.prisma, schoolId, query.classArmId, term.sessionId),
      this.prisma.termSubjectExamResult.findMany({
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

    let subjects: ExamReviewSubject[] = bySubjectEntries.map(([subjectId, { name, rows }]) => {
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

  // v0.7 step 3 (SPEC_V0.7.md §4): the per-term "Show exams" button —
  // one subject's exam breakdown for one term, for one student. Mirrors
  // GradesService.getReportCard's exact security resolution (student ->
  // enrollment -> resolveTeacherAccess for TEACHER -> publishedOnlyForSelfView
  // for STUDENT/PARENT), applied to a single subject slice instead of the
  // whole card. A subject is "visible" only when it has a
  // term_subject_exam_result row AND (staff, OR that row is PUBLISHED) —
  // exactly getReportCard's subjects-array filter, just for one subject:
  // never entered and not-yet-published for a self-view caller look
  // IDENTICAL (empty exams, null averages), so neither leaks the other.
  async getStudentSubjectExams(
    studentId: string,
    query: GetStudentSubjectExamsQueryDto,
    user: AuthenticatedUser,
  ): Promise<StudentSubjectExamsResponse> {
    const schoolId = this.tenantContext.schoolId;
    const [student, subject, term] = await Promise.all([
      this.prisma.student.findFirst({ where: forSchool(schoolId, { id: studentId, deletedAt: null }) }),
      this.prisma.subject.findFirst({ where: forSchool(schoolId, { id: query.subjectId, deletedAt: null }) }),
      this.prisma.term.findFirst({ where: forSchool(schoolId, { id: query.termId }) }),
    ]);
    if (!student) throw new NotFoundException("Student not found.");
    if (!subject) throw new NotFoundException("Subject not found.");
    if (!term) throw new NotFoundException("Term not found.");

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: forSchool(schoolId, { studentId, sessionId: query.sessionId }),
    });
    if (!enrollment) throw new NotFoundException("Student has no enrollment for this session.");

    if (user.role === UserRole.TEACHER) {
      const access = await resolveTeacherAccess(this.prisma, {
        schoolId,
        teacherUserId: user.userId,
        classArmId: enrollment.classArmId,
        sessionId: query.sessionId,
      });
      if (!access.isClassTeacher && access.subjectIds.length === 0) {
        throw new ForbiddenException("You do not teach this student.");
      }
    }

    const publishedOnlyForSelfView = user.role === UserRole.STUDENT || user.role === UserRole.PARENT;

    const subjectResult = await this.prisma.termSubjectExamResult.findFirst({
      where: { schoolId, studentId, subjectId: query.subjectId, termId: query.termId, sessionId: query.sessionId },
    });
    const visible = Boolean(subjectResult) && (!publishedOnlyForSelfView || subjectResult!.status === ResultStatus.PUBLISHED);

    if (!visible) {
      return {
        studentId,
        subjectId: query.subjectId,
        subjectName: subject.name,
        termId: query.termId,
        sessionId: query.sessionId,
        exams: [],
        subjectExamAverage: null,
        subjectExamGrade: null,
        status: null,
        classAverageScore: null,
      };
    }

    const exams = await this.prisma.exam.findMany({
      where: { schoolId, classArmId: enrollment.classArmId, subjectId: query.subjectId, termId: query.termId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const examIds = exams.map((e) => e.id);
    const scores = examIds.length > 0 ? await this.prisma.examScore.findMany({ where: { examId: { in: examIds }, studentId } }) : [];
    const scoreByExam = new Map(scores.map((s) => [s.examId, s]));

    // v0.7 step 5 (SPEC_V0.7.md §4) — comparative analytics. Only computed
    // once `visible` is true, matching this method's existing early-return:
    // an invisible subject stays byte-for-byte "nothing entered yet,"
    // never carrying a real classAverageScore either. Same eligibility
    // rule as GradesService.getReportCard: subject-level class average is
    // a direct groupBy-able aggregate (status lives on
    // term_subject_exam_results itself); per-exam best/worst needs the
    // studentId allow-list since exam_scores carries no status of its own.
    const [classAvgAgg, publishedRowsForEligibility, classScores] = await Promise.all([
      this.prisma.termSubjectExamResult.aggregate({
        where: {
          schoolId,
          classArmId: enrollment.classArmId,
          subjectId: query.subjectId,
          termId: query.termId,
          sessionId: query.sessionId,
          ...(publishedOnlyForSelfView ? { status: ResultStatus.PUBLISHED } : {}),
        },
        _avg: { totalScore: true },
      }),
      publishedOnlyForSelfView
        ? this.prisma.termSubjectExamResult.findMany({
            where: {
              schoolId,
              classArmId: enrollment.classArmId,
              subjectId: query.subjectId,
              termId: query.termId,
              sessionId: query.sessionId,
              status: ResultStatus.PUBLISHED,
            },
            select: { studentId: true },
          })
        : [],
      examIds.length > 0
        ? this.prisma.examScore.findMany({ where: { examId: { in: examIds } }, select: { examId: true, studentId: true, rawScore: true, isAbsent: true } })
        : [],
    ]);
    const classAverageScore = classAvgAgg._avg.totalScore === null ? null : Math.round(Number(classAvgAgg._avg.totalScore) * 100) / 100;
    const eligibleStudentIds = publishedOnlyForSelfView ? new Set(publishedRowsForEligibility.map((r) => r.studentId)) : null;
    const classScoresByExamId = new Map<string, typeof classScores>();
    for (const s of classScores) {
      const arr = classScoresByExamId.get(s.examId) ?? [];
      arr.push(s);
      classScoresByExamId.set(s.examId, arr);
    }

    return {
      studentId,
      subjectId: query.subjectId,
      subjectName: subject.name,
      termId: query.termId,
      sessionId: query.sessionId,
      exams: exams.map((e) => {
        const score = scoreByExam.get(e.id);
        const classRows = classScoresByExamId.get(e.id) ?? [];
        const stats = computeAssessmentClassStats(
          classRows.map((row) => ({ studentId: row.studentId, rawScore: row.rawScore === null ? null : Number(row.rawScore), isAbsent: row.isAbsent })),
          eligibleStudentIds,
        );
        return {
          examId: e.id,
          name: e.name ?? "Exam",
          rawScore: score?.rawScore === null || score?.rawScore === undefined ? null : Number(score.rawScore),
          isAbsent: score?.isAbsent ?? false,
          classAverageScore: stats.classAverageScore,
          bestScore: stats.bestScore,
          worstScore: stats.worstScore,
        };
      }),
      subjectExamAverage: Number(subjectResult!.totalScore),
      classAverageScore,
      subjectExamGrade: subjectResult!.autoGrade,
      status: subjectResult!.status,
    };
  }

  // v0.7 step 3 (SPEC_V0.7.md §4): the dedicated year-long Exams view.
  // Same security resolution as getStudentSubjectExams above, spanning
  // every term in the session. Visibility is independently gated at
  // EVERY level — a subject's own row, that term's cross-subject
  // aggregate, and the whole-session aggregate each check their OWN
  // status, exactly like getReportCard's subjects array (filtered
  // per-subject) versus its overall block (filtered separately): a
  // subject can be individually published before its term's cross-
  // subject average is (publish() is a per-subject action), and this
  // must show the published subject without waiting for the rest of
  // the term to catch up. This is also what makes a "partially published
  // year" (some terms published, some not) fall out for free — each
  // term's own termResult.status decides that term's aggregate
  // independently of every other term.
  async getStudentYearExams(studentId: string, query: GetYearExamsQueryDto, user: AuthenticatedUser): Promise<YearExamsResponse> {
    const schoolId = this.tenantContext.schoolId;
    const student = await this.prisma.student.findFirst({ where: forSchool(schoolId, { id: studentId, deletedAt: null }) });
    if (!student) throw new NotFoundException("Student not found.");

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: forSchool(schoolId, { studentId, sessionId: query.sessionId }),
    });
    if (!enrollment) throw new NotFoundException("Student has no enrollment for this session.");

    if (user.role === UserRole.TEACHER) {
      const access = await resolveTeacherAccess(this.prisma, {
        schoolId,
        teacherUserId: user.userId,
        classArmId: enrollment.classArmId,
        sessionId: query.sessionId,
      });
      if (!access.isClassTeacher && access.subjectIds.length === 0) {
        throw new ForbiddenException("You do not teach this student.");
      }
    }

    const publishedOnlyForSelfView = user.role === UserRole.STUDENT || user.role === UserRole.PARENT;

    const terms = await this.prisma.term.findMany({
      where: forSchool(schoolId, { sessionId: query.sessionId }),
      orderBy: { startsOn: "asc" },
    });

    const [allSubjectResults, allTermResults, yearResult] = await Promise.all([
      this.prisma.termSubjectExamResult.findMany({
        where: { schoolId, studentId, sessionId: query.sessionId },
        include: { subject: { select: { id: true, name: true } } },
      }),
      this.prisma.termExamResult.findMany({ where: { schoolId, studentId, sessionId: query.sessionId } }),
      this.prisma.yearExamResult.findFirst({ where: { schoolId, studentId, sessionId: query.sessionId } }),
    ]);

    const subjectResultsByTerm = new Map<string, typeof allSubjectResults>();
    for (const r of allSubjectResults) {
      const arr = subjectResultsByTerm.get(r.termId) ?? [];
      arr.push(r);
      subjectResultsByTerm.set(r.termId, arr);
    }
    const termResultByTermId = new Map(allTermResults.map((r) => [r.termId, r]));

    const allExams = terms.length
      ? await this.prisma.exam.findMany({
          where: { schoolId, classArmId: enrollment.classArmId, termId: { in: terms.map((t) => t.id) }, deletedAt: null },
        })
      : [];
    const examIds = allExams.map((e) => e.id);
    const allScores = examIds.length > 0 ? await this.prisma.examScore.findMany({ where: { examId: { in: examIds }, studentId } }) : [];
    const scoreByExam = new Map(allScores.map((s) => [s.examId, s]));
    const examsByTermAndSubject = new Map<string, typeof allExams>();
    for (const e of allExams) {
      const key = `${e.termId}:${e.subjectId}`;
      const arr = examsByTermAndSubject.get(key) ?? [];
      arr.push(e);
      examsByTermAndSubject.set(key, arr);
    }

    // v0.7 step 5 (SPEC_V0.7.md §4) — comparative analytics, batched
    // across the WHOLE year in one extra query per level (never per-term/
    // per-subject/per-exam). `visibleSubjectResultsAll` is the exact same
    // per-row status predicate the termViews.map() below applies per
    // term — computed once here so the analytics queries can be scoped to
    // it up front; correctness still comes from each aggregate's own
    // `status: PUBLISHED` where-clause (self-view only), not from this
    // coarse pre-filter, so a subject visible in one term but not another
    // can never cross-contaminate.
    const termIds = terms.map((t) => t.id);
    const visibleSubjectResultsAll = allSubjectResults.filter((r) => !publishedOnlyForSelfView || r.status === ResultStatus.PUBLISHED);
    const visibleSubjectIds = [...new Set(visibleSubjectResultsAll.map((r) => r.subjectId))];

    const [subjectClassAverages, subjectEligibilityRows, classExamScores, termClassAverages, classmates] = await Promise.all([
      visibleSubjectIds.length > 0
        ? this.prisma.termSubjectExamResult.groupBy({
            by: ["termId", "subjectId"],
            where: {
              schoolId,
              classArmId: enrollment.classArmId,
              sessionId: query.sessionId,
              subjectId: { in: visibleSubjectIds },
              termId: { in: termIds },
              ...(publishedOnlyForSelfView ? { status: ResultStatus.PUBLISHED } : {}),
            },
            _avg: { totalScore: true },
          })
        : [],
      publishedOnlyForSelfView && visibleSubjectIds.length > 0
        ? this.prisma.termSubjectExamResult.findMany({
            where: {
              schoolId,
              classArmId: enrollment.classArmId,
              sessionId: query.sessionId,
              subjectId: { in: visibleSubjectIds },
              termId: { in: termIds },
              status: ResultStatus.PUBLISHED,
            },
            select: { termId: true, subjectId: true, studentId: true },
          })
        : [],
      examIds.length > 0
        ? this.prisma.examScore.findMany({ where: { examId: { in: examIds } }, select: { examId: true, studentId: true, rawScore: true, isAbsent: true } })
        : [],
      termIds.length > 0
        ? this.prisma.termExamResult.groupBy({
            by: ["termId"],
            where: {
              schoolId,
              classArmId: enrollment.classArmId,
              sessionId: query.sessionId,
              termId: { in: termIds },
              ...(publishedOnlyForSelfView ? { status: ResultStatus.PUBLISHED } : {}),
            },
            _avg: { averageScore: true },
          })
        : [],
      // year_exam_results has no class_arm_id (it's whole-session, not
      // per-class-arm) — "class" membership for the year-level general
      // average has to be resolved via this session's roster instead of a
      // direct column filter, unlike every other level above.
      getRoster(this.prisma, schoolId, enrollment.classArmId, query.sessionId),
    ]);

    const classAverageByTermSubject = new Map(
      subjectClassAverages.map((c) => [`${c.termId}:${c.subjectId}`, c._avg.totalScore === null ? null : Math.round(Number(c._avg.totalScore) * 100) / 100]),
    );
    const eligibleStudentIdsByTermSubject = new Map<string, Set<string>>();
    for (const row of subjectEligibilityRows) {
      const key = `${row.termId}:${row.subjectId}`;
      const set = eligibleStudentIdsByTermSubject.get(key) ?? new Set<string>();
      set.add(row.studentId);
      eligibleStudentIdsByTermSubject.set(key, set);
    }
    const classScoresByExamId = new Map<string, typeof classExamScores>();
    for (const s of classExamScores) {
      const arr = classScoresByExamId.get(s.examId) ?? [];
      arr.push(s);
      classScoresByExamId.set(s.examId, arr);
    }
    const termClassAverageByTermId = new Map(
      termClassAverages.map((c) => [c.termId, c._avg.averageScore === null ? null : Math.round(Number(c._avg.averageScore) * 100) / 100]),
    );

    const termViews: YearExamsTerm[] = terms.map((term) => {
      const termResult = termResultByTermId.get(term.id);
      const termAggregateVisible = Boolean(termResult) && (!publishedOnlyForSelfView || termResult!.status === ResultStatus.PUBLISHED);

      const subjectResultsThisTerm = subjectResultsByTerm.get(term.id) ?? [];
      const visibleSubjectResults = subjectResultsThisTerm.filter((r) => !publishedOnlyForSelfView || r.status === ResultStatus.PUBLISHED);

      const subjects: YearExamsTermSubject[] = visibleSubjectResults
        .map((r) => {
          const exams = examsByTermAndSubject.get(`${term.id}:${r.subjectId}`) ?? [];
          const eligibleForSubject = publishedOnlyForSelfView
            ? (eligibleStudentIdsByTermSubject.get(`${term.id}:${r.subjectId}`) ?? new Set<string>())
            : null;
          return {
            subjectId: r.subjectId,
            subjectName: r.subject.name,
            exams: exams.map((e) => {
              const score = scoreByExam.get(e.id);
              const classRows = classScoresByExamId.get(e.id) ?? [];
              const stats = computeAssessmentClassStats(
                classRows.map((row) => ({ studentId: row.studentId, rawScore: row.rawScore === null ? null : Number(row.rawScore), isAbsent: row.isAbsent })),
                eligibleForSubject,
              );
              return {
                examId: e.id,
                name: e.name ?? "Exam",
                rawScore: score?.rawScore === null || score?.rawScore === undefined ? null : Number(score.rawScore),
                isAbsent: score?.isAbsent ?? false,
                classAverageScore: stats.classAverageScore,
                bestScore: stats.bestScore,
                worstScore: stats.worstScore,
              };
            }),
            subjectExamAverage: Number(r.totalScore),
            subjectExamGrade: r.autoGrade,
            classAverageScore: classAverageByTermSubject.get(`${term.id}:${r.subjectId}`) ?? null,
          };
        })
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

      return {
        termId: term.id,
        termName: term.name,
        subjects,
        termExamAverage: termAggregateVisible ? Number(termResult!.averageScore) : null,
        termExamGrade: termAggregateVisible ? termResult!.averageGrade : null,
        termExamPosition: termAggregateVisible ? termResult!.examPosition : null,
        status: termAggregateVisible ? termResult!.status : null,
        classAverageScore: termAggregateVisible ? (termClassAverageByTermId.get(term.id) ?? null) : null,
      };
    });

    const yearVisible = Boolean(yearResult) && (!publishedOnlyForSelfView || yearResult!.status === ResultStatus.PUBLISHED);

    let generalClassAverage: number | null = null;
    if (yearVisible) {
      const classmateIds = classmates.map((s) => s.id);
      const yearClassAvg =
        classmateIds.length > 0
          ? await this.prisma.yearExamResult.aggregate({
              where: {
                schoolId,
                sessionId: query.sessionId,
                studentId: { in: classmateIds },
                ...(publishedOnlyForSelfView ? { status: ResultStatus.PUBLISHED } : {}),
              },
              _avg: { averageScore: true },
            })
          : null;
      generalClassAverage = yearClassAvg?._avg.averageScore == null ? null : Math.round(Number(yearClassAvg._avg.averageScore) * 100) / 100;
    }

    return {
      studentId,
      sessionId: query.sessionId,
      terms: termViews,
      generalClassAverage,
      overallExamAverage: yearVisible ? Number(yearResult!.averageScore) : null,
      overallExamGrade: yearVisible ? yearResult!.averageGrade : null,
      yearExamPosition: yearVisible ? yearResult!.yearExamPosition : null,
      termsCount: yearVisible ? yearResult!.termsCount : 0,
      overallStatus: yearVisible ? yearResult!.status : null,
    };
  }

  // Re-derives term_subject_exam_results for each given student from ALL
  // of their current exam_scores across every active Exam for (classArmId,
  // subjectId, termId) — mirrors GradesService.recomputeStudents exactly,
  // minus overrideGrade/finalGrade/subjectPosition (no such fields on this
  // table — see model's own comment).
  // v0.7.4 step 2 (SPEC_V0.7.4.md §3) — generalized from
  // preservePublishedStudentIds: Set<string> to a status map, since a
  // bypassed write can now happen during EITHER lock tier (PUBLISHED or
  // PENDING_APPROVAL, saveExamScores' own widened gate above) and must
  // preserve whichever one currently applies, not force everyone toward
  // PUBLISHED. A student absent from the map (the normal, non-bypass
  // path) still resolves to DRAFT exactly as before.
  private async recomputeExamStudents(
    tx: Prisma.TransactionClient,
    ctx: RecomputeContext,
    studentIds: string[],
    preserveStatusByStudentId?: Map<string, ResultStatus>,
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
      const preservedStatus = preserveStatusByStudentId?.get(studentId);
      const status = preservedStatus ?? ResultStatus.DRAFT;
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
          // undefined = leave the existing publishedAt untouched — correct
          // whether the preserved status is PUBLISHED (a real timestamp
          // already there) or PENDING_APPROVAL (already null).
          publishedAt: preservedStatus ? undefined : null,
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

  // v0.7.4 step 2 (SPEC_V0.7.4.md §3 Q5) — rewritten ROSTER-WIDE, reusing
  // GradesService.findIncompleteStudentsForEvaluation's shape (Step 1):
  // `studentIds` is now the FULL currently-enrolled roster (from
  // getRoster(), passed in by submitForApproval), not a candidate list
  // derived from students who already happen to have a
  // term_subject_exam_result row — that was the old carve-out this
  // replaces. Single-subject now (submit always targets exactly one
  // subject; the old multi-subject candidate shape was never used by more
  // than one call site). "Blank" = no exam_scores row, or a row with
  // rawScore IS NULL AND isAbsent = false; absent is NOT blank.
  private async findIncompleteExamEntries(
    tx: Prisma.TransactionClient,
    ctx: { schoolId: string; subjectId: string; termId: string; sessionId: string },
    studentIds: string[],
  ): Promise<Array<{ studentId: string; examId: string }>> {
    if (studentIds.length === 0) return [];

    const exams = await tx.exam.findMany({
      where: { schoolId: ctx.schoolId, termId: ctx.termId, sessionId: ctx.sessionId, subjectId: ctx.subjectId, deletedAt: null },
      select: { id: true },
    });
    const examIds = exams.map((e) => e.id);
    if (examIds.length === 0) return [];

    const scores = await tx.examScore.findMany({ where: { examId: { in: examIds }, studentId: { in: studentIds } } });
    const decided = new Set(
      scores.filter((s) => (s.rawScore !== null && s.rawScore !== undefined) || s.isAbsent).map((s) => `${s.examId}:${s.studentId}`),
    );

    const incomplete: Array<{ studentId: string; examId: string }> = [];
    for (const studentId of studentIds) {
      for (const examId of examIds) {
        if (!decided.has(`${examId}:${studentId}`)) {
          incomplete.push({ studentId, examId });
        }
      }
    }
    return incomplete;
  }

  // Renamed from publishedLockException (v0.7.4 step 2) — now covers
  // PENDING_APPROVAL too, not just PUBLISHED, so "published" alone would
  // be a misleading name.
  private resultLockException(action: string, lockedStudentIds: string[]): ConflictException {
    return new ConflictException({
      message: `Cannot ${action}: ${lockedStudentIds.length} student(s) already have published or pending-approval exam results for this subject — unpublish (if published) or wait for the pending approval decision first.`,
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
