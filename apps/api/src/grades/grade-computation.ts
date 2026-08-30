// Pure computation for SPEC_V0.4.md §1's "Computation rules", carried
// forward and rewritten for v0.7 step 1 (SPEC_V0.7.md §2/§5) — evaluations
// replace the fixed CA1/CA2/Exam weighted model entirely; exams compute
// separately (grades.service.ts / exams.service.ts). Deliberately
// dependency-free (no Prisma types, no NestJS DI) so both services and
// prisma/seed.ts (a bare PrismaClient, no DI container) can call it directly.

export type ResultStatus = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED";

export interface GradeBoundaryInput {
  grade: string;
  minScore: number;
  maxScore: number;
}

export interface DecidableScoreInput {
  rawScore: number | null;
  // A third, explicit state distinct from both "not entered" (rawScore
  // null, isAbsent false) and a real 0 (rawScore set) — SPEC_V0.5.md §2.1,
  // carried forward unchanged into both v0.7 tracks. A row with rawScore
  // set AND isAbsent true is uninterpretable and never reaches here —
  // enforced by the evaluation_scores/exam_scores CHECK constraints and
  // the score-entry DTOs.
  isAbsent: boolean;
}

/**
 * Simple mean of decided (non-absent, non-null) scores, each already
 * native /100 (SPEC_V0.7.md Q1 — no weighting, no rescaling). An absent
 * score is excluded from BOTH the numerator and the denominator — the
 * same "honest average over what was actually sat" rule v0.5 established
 * for the old weighted model, just without a weight to multiply by. 0 if
 * nothing is decided yet (mirrors the old model's "no score contributes 0"
 * resolution — never null, since totalScore/averageScore columns are
 * NOT NULL).
 */
export function computeEvaluationAverage(scores: DecidableScoreInput[]): number {
  const decided = scores.filter((s) => !s.isAbsent && s.rawScore !== null && s.rawScore !== undefined);
  if (decided.length === 0) return 0;
  const sum = decided.reduce((total, s) => total + s.rawScore!, 0);
  return Math.round((sum / decided.length) * 100) / 100;
}

/**
 * A term_overall_result's status derives from its subject results: PUBLISHED
 * only once every subject is published; PENDING_APPROVAL if there's any
 * activity short of that; DRAFT if nothing has started. Unchanged from
 * v0.4 — still meaningful at the cross-subject level even though the
 * per-subject level no longer auto-transitions through PENDING_APPROVAL
 * (confirmed: publishing itself is what declares a subject final now).
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

/** Simple unweighted mean of a student's subject totals (SPEC_V0.4.md §6). Reused unchanged for the year-exam-average-of-term-averages cascade (SPEC_V0.7.md Q6). */
export function computeOverallAverage(subjectTotals: number[]): number {
  if (subjectTotals.length === 0) return 0;
  const sum = subjectTotals.reduce((a, b) => a + b, 0);
  return Math.round((sum / subjectTotals.length) * 100) / 100;
}

/** Standard competition ranking ("1,2,2,4"): ties share a position, the next rank skips. Reused unchanged for all three v0.7 ranking tracks (Q6). */
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
