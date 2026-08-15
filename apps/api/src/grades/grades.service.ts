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
import { GetGradesReviewQueryDto } from "./dto/get-grades-review-query.dto";
import { GetClassArmResultsQueryDto } from "./dto/get-class-arm-results-query.dto";
import { GetStudentResultsQueryDto } from "./dto/get-student-results-query.dto";

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

export interface GradesReviewSubject {
  subjectId: string;
  subjectName: string;
  rosterSize: number;
  draftCount: number;
  pendingApprovalCount: number;
  publishedCount: number;
  averageScore: number;
  averageGrade: string | null;
  // Mirrors publish()'s own "nothing to do" 409 condition exactly
  // (pendingApprovalCount > 0 OR publishedCount > 0) so the UI can disable
  // the Publish button instead of offering an action that will just 409.
  canPublish: boolean;
}

export interface GradesReviewResponse {
  classArmId: string;
  termId: string;
  subjects: GradesReviewSubject[];
}

export interface StudentResultSubject {
  subjectId: string;
  subjectName: string;
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

interface TeacherAccess {
  isClassTeacher: boolean;
  subjectIds: string[];
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
    const classArmLockKey = this.classArmLockKey(schoolId, dto.classArmId, dto.termId);

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

        // Gap #2 (docs/DECISIONS.md): a student's overall can only be
        // PUBLISHED if every subject they've been scored in so far is
        // itself PUBLISHED — and a student whose row for THIS subject is
        // already PUBLISHED already 409'd above. So the only way this
        // save can strand a stale overall is by creating a genuinely NEW
        // subject-result (no existing row) for a student whose overall is
        // currently PUBLISHED — editing an existing row can never reach
        // this. Detected from `existingResults` (already fetched, no new
        // query) so the common "re-save an already-touched grid" path
        // costs nothing extra; the one additional query only fires when a
        // real candidate exists.
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

        // Class-arm lock ALWAYS after the subject lock, never before —
        // same fixed order publish()/unpublish() already use, so no
        // caller can deadlock against another (only ever contend ON the
        // class-arm lock itself, never hold it while trying to acquire a
        // different subject lock). Only acquired when genuinely needed
        // (gap #2, see above) — the normal save path never touches it.
        if (needsOverallRecompute) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${classArmLockKey}))`;
          await this.recomputeOverallForClassArm(tx, {
            schoolId,
            classArmId: dto.classArmId,
            termId: dto.termId,
            sessionId: term.sessionId,
          });
        }

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
      { timeout: 20000 }, // was 15000 — bumped to match publish()'s budget for the same added class-arm-wide phase (only spent when needsOverallRecompute fires)
    );
  }

  // Admin-only manual re-trigger (SPEC_V0.4.md §2) — re-derives
  // term_subject_results for a whole class arm + subject + term from
  // whatever student_scores currently exist, e.g. after a roster fix.
  // No new computation logic: same recomputeStudents() PUT /grades/grid
  // already uses.
  //
  // Carries the same latent gap #2 saveGrid() was just fixed for (see its
  // comment): this can also create a first-ever term_subject_result for a
  // student whose overall is currently PUBLISHED, and doesn't (yet)
  // trigger an overall recompute for that case. Not fixed here —
  // deliberately out of this fix's scope (docs/DECISIONS.md), not slipped
  // in unapproved.
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
    const { term } = await this.resolveTenantScopeArmTermOnly(schoolId, classArmId, query.termId);

    let visibleSubjectIds: Set<string> | null = null; // null = no filter (admin/owner/class-teacher)
    let includeOverall = true;
    if (user.role === UserRole.TEACHER) {
      const access = await this.resolveTeacherAccess(schoolId, user.userId, classArmId, term.sessionId);
      if (!access.isClassTeacher && access.subjectIds.length === 0) {
        throw new ForbiddenException("You are not assigned to this class.");
      }
      includeOverall = access.isClassTeacher;
      visibleSubjectIds = access.isClassTeacher ? null : new Set(access.subjectIds);
    }

    const [students, subjectResults, overallResults, boundaries] = await Promise.all([
      this.getRoster(schoolId, classArmId, term.sessionId),
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

  // Director/owner publish-readiness view (SPEC_V0.4.md §2). A subject's
  // state is deliberately returned as COUNTS, not one status: saveGrid's
  // per-student PUBLISHED lock means stragglers can land in
  // PENDING_APPROVAL after their classmates are already PUBLISHED for the
  // very same subject (see publish()'s own doc comment — publishing can
  // legitimately happen more than once), so draft/pending/published can
  // genuinely coexist for one subject. canPublish mirrors publish()'s own
  // "nothing to do" 409 condition exactly, so the UI never has to
  // reimplement that rule to decide whether the button should be enabled.
  // No TEACHER path at all — SCHOOL_ADMIN/PROPRIETOR only, enforced by
  // @Roles() at the controller.
  async getReview(query: GetGradesReviewQueryDto): Promise<GradesReviewResponse> {
    const schoolId = this.tenantContext.schoolId;
    const { term } = await this.resolveTenantScopeArmTermOnly(schoolId, query.classArmId, query.termId);

    const [students, subjectResults, boundaries] = await Promise.all([
      this.getRoster(schoolId, query.classArmId, term.sessionId),
      this.prisma.termSubjectResult.findMany({
        where: { schoolId, classArmId: query.classArmId, termId: query.termId, sessionId: term.sessionId },
        include: { subject: { select: { id: true, name: true } } },
      }),
      this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } }),
    ]);
    const boundaryInputs: GradeBoundaryInput[] = boundaries.map((b) => ({ grade: b.grade, minScore: b.minScore, maxScore: b.maxScore }));
    const rosterSize = students.length;

    const bySubject = new Map<string, { name: string; rows: typeof subjectResults }>();
    for (const row of subjectResults) {
      const bucket = bySubject.get(row.subjectId) ?? { name: row.subject.name, rows: [] };
      bucket.rows.push(row);
      bySubject.set(row.subjectId, bucket);
    }

    let subjects: GradesReviewSubject[] = [...bySubject.entries()].map(([subjectId, { name, rows }]) => {
      const draftCount = rows.filter((r) => r.status === ResultStatus.DRAFT).length;
      const pendingApprovalCount = rows.filter((r) => r.status === ResultStatus.PENDING_APPROVAL).length;
      const publishedCount = rows.filter((r) => r.status === ResultStatus.PUBLISHED).length;
      const averageScore = computeOverallAverage(rows.map((r) => Number(r.totalScore)));
      return {
        subjectId,
        subjectName: name,
        rosterSize,
        draftCount,
        pendingApprovalCount,
        publishedCount,
        averageScore,
        averageGrade: resolveGradeBand(averageScore, boundaryInputs),
        canPublish: pendingApprovalCount > 0 || publishedCount > 0,
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
      const access = await this.resolveTeacherAccess(schoolId, user.userId, enrollment.classArmId, query.sessionId);
      if (!access.isClassTeacher && access.subjectIds.length === 0) {
        throw new ForbiddenException("You do not teach this student.");
      }
    }

    const [subjectResults, overall, boundaries] = await Promise.all([
      this.prisma.termSubjectResult.findMany({
        where: { schoolId, studentId, termId: query.termId, sessionId: query.sessionId },
        include: { subject: { select: { id: true, name: true } } },
      }),
      this.prisma.termOverallResult.findFirst({ where: { schoolId, studentId, termId: query.termId, sessionId: query.sessionId } }),
      this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } }),
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
        isAbsent: s.isAbsent,
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

  private async resolveTenantScopeArmTermOnly(schoolId: string, classArmId: string, termId: string): Promise<{ term: Term }> {
    const [classArm, term] = await Promise.all([
      this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: classArmId }) }),
      this.prisma.term.findFirst({ where: forSchool(schoolId, { id: termId }) }),
    ]);
    if (!classArm) throw new NotFoundException("Class arm not found.");
    if (!term) throw new NotFoundException("Term not found.");
    return { term };
  }

  // The one unifying "what can this teacher see in this class arm" rule,
  // shared by getClassArmResults() and getStudentResults() — each consumes
  // it differently (row-filter vs. plain allow/deny), but there is exactly
  // one definition of "class-teacher sees everything, subject-teacher sees
  // their lane" in this codebase, not two slightly different ones.
  private async resolveTeacherAccess(
    schoolId: string,
    teacherUserId: string,
    classArmId: string,
    sessionId: string,
  ): Promise<TeacherAccess> {
    const [classTeacher, subjectAssignments] = await Promise.all([
      this.prisma.classTeacherAssignment.findFirst({ where: forSchool(schoolId, { classArmId, sessionId, teacherUserId }) }),
      this.prisma.subjectTeacherAssignment.findMany({
        where: forSchool(schoolId, { classArmId, sessionId, teacherUserId }),
        select: { subjectId: true },
      }),
    ]);
    return { isClassTeacher: Boolean(classTeacher), subjectIds: subjectAssignments.map((a) => a.subjectId) };
  }
}
