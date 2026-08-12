import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ResultStatus, StudentStatus, UserRole, type AssessmentComponent, type Term } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import {
  computeSubjectTotal,
  computeSubjectStatus,
  resolveGradeBand,
  resolveFinalGrade,
  type ComponentInput,
  type ComponentScoreInput,
  type GradeBoundaryInput,
} from "../grades/grade-computation";
import { GetGradesGridQueryDto } from "./dto/get-grades-grid-query.dto";
import { SaveGradesGridDto } from "./dto/save-grades-grid.dto";
import { RecomputeGradesDto } from "./dto/recompute-grades.dto";

export interface GradesGridRow {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  rawScore: number | null;
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
    const scores = await this.prisma.studentScore.findMany({
      where: {
        schoolId,
        subjectId: query.subjectId,
        componentId: query.componentId,
        termId: query.termId,
        sessionId: term.sessionId,
      },
    });
    const rawByStudent = new Map(scores.map((s) => [s.studentId, s.rawScore === null ? null : Number(s.rawScore)]));

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
    const lockKey = `grades:${schoolId}:${dto.subjectId}:${dto.classArmId}:${dto.termId}`;

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

    const lockKey = `grades:${schoolId}:${dto.subjectId}:${dto.classArmId}:${dto.termId}`;

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

  // Re-derives term_subject_results for each given student from ALL of
  // their current student_scores for (subjectId, termId, sessionId) —
  // across every active component, not just whichever one triggered this
  // call — using the pure functions in grade-computation.ts. Callers must
  // have already verified none of these students' existing results are
  // PUBLISHED; this function does not re-check.
  private async recomputeStudents(
    tx: Prisma.TransactionClient,
    ctx: RecomputeContext,
    studentIds: string[],
  ): Promise<RecomputedRow[]> {
    const [components, boundaries] = await Promise.all([
      tx.assessmentComponent.findMany({ where: { schoolId: ctx.schoolId, deletedAt: null } }),
      tx.gradeBoundary.findMany({ where: { schoolId: ctx.schoolId }, orderBy: { sortOrder: "asc" } }),
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
      // overrideGrade is always null here — grade override is step 3.
      const finalGrade = resolveFinalGrade(autoGrade, null);

      const saved = await tx.termSubjectResult.upsert({
        where: {
          studentId_subjectId_termId_sessionId: {
            studentId,
            subjectId: ctx.subjectId,
            termId: ctx.termId,
            sessionId: ctx.sessionId,
          },
        },
        update: { totalScore, autoGrade, finalGrade, status, classArmId: ctx.classArmId },
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
