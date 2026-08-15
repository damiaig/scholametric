// Pure computation for SPEC_V0.4.md §1's "Computation rules". Deliberately
// dependency-free (no Prisma types, no NestJS DI) so both the future
// grades service (step 2) and prisma/seed.ts (which uses a bare
// PrismaClient, no DI container) can call it directly.

export type ResultStatus = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED";

export interface ComponentInput {
  id: string;
  weight: number;
  maxScore: number;
  requiresApproval: boolean;
}

export interface ComponentScoreInput {
  componentId: string;
  rawScore: number | null;
  // SPEC_V0.5.md §2.1 — a third state, distinct from both "not entered"
  // (rawScore null, isAbsent false) and a real 0 (rawScore set). A row
  // with rawScore set AND isAbsent true is uninterpretable and never
  // reaches here — enforced by student_scores' CHECK constraint and (from
  // v0.5 step 2) the score-entry DTO.
  isAbsent: boolean;
}

export interface GradeBoundaryInput {
  grade: string;
  minScore: number;
  maxScore: number;
}

/**
 * Subject total = Σ over components of (rawScore / component.maxScore ×
 * component.weight), 0–100. A component with no score yet contributes 0 —
 * NOT a rescale to the entered weight's own 100% (SPEC_V0.4.md §1
 * resolution: avoids a class average that visibly drops once Exam scores
 * land, which would look like a bug). A component the student was marked
 * ABSENT for is excluded the same way — SPEC_V0.5.md §2.1: honestly lower
 * over the components actually sat, not a 0 and not rescaled.
 */
export function computeSubjectTotal(components: ComponentInput[], scores: ComponentScoreInput[]): number {
  const scoreByComponent = new Map(scores.map((s) => [s.componentId, s]));
  let total = 0;
  for (const component of components) {
    const score = scoreByComponent.get(component.id);
    if (!score || score.isAbsent || score.rawScore === null || score.rawScore === undefined) continue;
    total += (score.rawScore / component.maxScore) * component.weight;
  }
  return Math.round(total * 100) / 100;
}

/**
 * DRAFT until an approval-required (exam-type) component has been decided
 * for this student — scored OR marked absent, both are a decided outcome,
 * unlike not-yet-entered (SPEC_V0.5.md §2.1: absent is not "stuck in
 * DRAFT"). Then PENDING_APPROVAL. Never returns PUBLISHED — that only
 * happens via an explicit publish action, not score-triggered recompute.
 */
export function computeSubjectStatus(
  components: ComponentInput[],
  scores: ComponentScoreInput[],
): "DRAFT" | "PENDING_APPROVAL" {
  const scoreByComponent = new Map(scores.map((s) => [s.componentId, s]));
  const anyApprovalRequiredDecided = components
    .filter((c) => c.requiresApproval)
    .some((c) => {
      const score = scoreByComponent.get(c.id);
      if (!score) return false;
      return score.isAbsent || (score.rawScore !== null && score.rawScore !== undefined);
    });
  return anyApprovalRequiredDecided ? "PENDING_APPROVAL" : "DRAFT";
}

/**
 * A term_overall_result's status derives from its subject results: PUBLISHED
 * only once every subject is published; PENDING_APPROVAL if there's any
 * activity short of that; DRAFT if nothing has started.
 */
export function computeOverallStatus(subjectStatuses: ResultStatus[]): ResultStatus {
  if (subjectStatuses.length === 0) return "DRAFT";
  if (subjectStatuses.every((s) => s === "PUBLISHED")) return "PUBLISHED";
  if (subjectStatuses.some((s) => s !== "DRAFT")) return "PENDING_APPROVAL";
  return "DRAFT";
}

/**
 * Grade boundaries are integer-tiled 0–100; totals are decimal. Rounds to
 * the nearest whole point (clamped to [0,100]) before the boundary lookup —
 * documented in docs/DECISIONS.md.
 */
export function resolveGradeBand(score: number, boundaries: GradeBoundaryInput[]): string | null {
  const rounded = Math.min(100, Math.max(0, Math.round(score)));
  const band = boundaries.find((b) => rounded >= b.minScore && rounded <= b.maxScore);
  return band ? band.grade : null;
}

export function resolveFinalGrade(autoGrade: string | null, overrideGrade: string | null | undefined): string | null {
  return overrideGrade ?? autoGrade;
}

/** Simple unweighted mean of a student's subject totals (SPEC_V0.4.md §6). */
export function computeOverallAverage(subjectTotals: number[]): number {
  if (subjectTotals.length === 0) return 0;
  const sum = subjectTotals.reduce((a, b) => a + b, 0);
  return Math.round((sum / subjectTotals.length) * 100) / 100;
}

/** Standard competition ranking ("1,2,2,4"): ties share a position, the next rank skips. */
export function computeStandardCompetitionRanking<T>(
  items: T[],
  scoreOf: (item: T) => number,
): Array<{ item: T; position: number }> {
  const sorted = [...items].sort((a, b) => scoreOf(b) - scoreOf(a));
  const result: Array<{ item: T; position: number }> = [];
  let lastScore: number | null = null;
  let lastPosition = 0;
  sorted.forEach((item, index) => {
    const score = scoreOf(item);
    if (lastScore === null || score !== lastScore) {
      lastPosition = index + 1;
      lastScore = score;
    }
    result.push({ item, position: lastPosition });
  });
  return result;
}
