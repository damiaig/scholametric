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
 * land, which would look like a bug).
 */
export function computeSubjectTotal(components: ComponentInput[], scores: ComponentScoreInput[]): number {
  const rawByComponent = new Map(scores.map((s) => [s.componentId, s.rawScore]));
  let total = 0;
  for (const component of components) {
    const raw = rawByComponent.get(component.id);
    if (raw === null || raw === undefined) continue;
    total += (raw / component.maxScore) * component.weight;
  }
  return Math.round(total * 100) / 100;
}

/**
 * DRAFT until an approval-required (exam-type) component has a score for
 * this student, then PENDING_APPROVAL. Never returns PUBLISHED — that only
 * happens via an explicit publish action, not score-triggered recompute.
 */
export function computeSubjectStatus(
  components: ComponentInput[],
  scores: ComponentScoreInput[],
): "DRAFT" | "PENDING_APPROVAL" {
  const rawByComponent = new Map(scores.map((s) => [s.componentId, s.rawScore]));
  const anyApprovalRequiredScored = components
    .filter((c) => c.requiresApproval)
    .some((c) => {
      const raw = rawByComponent.get(c.id);
      return raw !== null && raw !== undefined;
    });
  return anyApprovalRequiredScored ? "PENDING_APPROVAL" : "DRAFT";
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
