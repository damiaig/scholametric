import { formatScore } from "./format-score";

// v0.7 step 5 (SPEC_V0.7.md §4) — comparative analytics, rendered as
// anonymous numbers only (Q5's hard privacy rule: class average and
// best/worst are numbers, NEVER a name — "Best in class: 92", never
// "Best: Chidi Okafor: 92"). Shared across ReportCardDocument/
// SubjectExamsPanel/YearExamsView so this format is defined exactly once.
// Both components render nothing when every value is null — matches the
// rest of this app's "absent, not disabled/zeroed" convention for
// not-yet-available data.

export function ClassAverageLabel({ value }: { value: number | null }) {
  if (value === null) return null;
  return <span className="text-xs text-muted">Class avg {formatScore(value)}</span>;
}

interface AssessmentClassStatsLabelProps {
  classAverageScore: number | null;
  bestScore: number | null;
  worstScore: number | null;
}

export function AssessmentClassStatsLabel({ classAverageScore, bestScore, worstScore }: AssessmentClassStatsLabelProps) {
  if (classAverageScore === null && bestScore === null && worstScore === null) return null;
  const parts: string[] = [];
  if (classAverageScore !== null) parts.push(`Class avg ${formatScore(classAverageScore)}`);
  if (bestScore !== null) parts.push(`Best ${formatScore(bestScore)}`);
  if (worstScore !== null) parts.push(`Worst ${formatScore(worstScore)}`);
  return <span className="text-xs text-muted">{parts.join(" · ")}</span>;
}
