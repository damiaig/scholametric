export interface GradingPresetRow {
  grade: string;
  minScore: number;
  maxScore: number;
  remark: string;
  sortOrder: number;
}

// SPEC_V0.3.md §2 — static, local lookup tables only (resolution 10: no
// external WAEC/NECO system, API, or result submission involved; does not
// touch CLAUDE.md §9's "WAEC/NECO integration" out-of-scope line). Both
// tile 0-100 with no gaps or overlaps, matching the same rule the PUT
// endpoint enforces on whatever a school actually saves.
export const WAEC_9_POINT_PRESET: GradingPresetRow[] = [
  { grade: "A1", minScore: 75, maxScore: 100, remark: "Excellent", sortOrder: 1 },
  { grade: "B2", minScore: 70, maxScore: 74, remark: "Very Good", sortOrder: 2 },
  { grade: "B3", minScore: 65, maxScore: 69, remark: "Good", sortOrder: 3 },
  { grade: "C4", minScore: 60, maxScore: 64, remark: "Credit", sortOrder: 4 },
  { grade: "C5", minScore: 55, maxScore: 59, remark: "Credit", sortOrder: 5 },
  { grade: "C6", minScore: 50, maxScore: 54, remark: "Credit", sortOrder: 6 },
  { grade: "D7", minScore: 45, maxScore: 49, remark: "Pass", sortOrder: 7 },
  { grade: "E8", minScore: 40, maxScore: 44, remark: "Pass", sortOrder: 8 },
  { grade: "F9", minScore: 0, maxScore: 39, remark: "Fail", sortOrder: 9 },
];

// The spec names a "simple A-F preset" but doesn't specify exact bands —
// this 5-band scheme (a common simpler alternative to WAEC's 9-point
// scale) was chosen for this step; see docs/DECISIONS.md.
export const SIMPLE_A_TO_F_PRESET: GradingPresetRow[] = [
  { grade: "A", minScore: 70, maxScore: 100, remark: "Excellent", sortOrder: 1 },
  { grade: "B", minScore: 60, maxScore: 69, remark: "Very Good", sortOrder: 2 },
  { grade: "C", minScore: 50, maxScore: 59, remark: "Good", sortOrder: 3 },
  { grade: "D", minScore: 45, maxScore: 49, remark: "Pass", sortOrder: 4 },
  { grade: "F", minScore: 0, maxScore: 44, remark: "Fail", sortOrder: 5 },
];
