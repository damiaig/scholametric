import { computeAssessmentClassStats, computeEvaluationAverage, type ClassScoreRow, type DecidableScoreInput } from "./grade-computation";

describe("computeEvaluationAverage — absent exclusion (SPEC_V0.7.md §2/§5)", () => {
  it("averages decided scores, native /100, no weighting", () => {
    // 18, 20, 55 -> mean 31, not any weighted recombination.
    const scores: DecidableScoreInput[] = [
      { rawScore: 18, isAbsent: false },
      { rawScore: 20, isAbsent: false },
      { rawScore: 55, isAbsent: false },
    ];
    expect(computeEvaluationAverage(scores)).toBe(31);
  });

  it("excludes an absent evaluation from BOTH the numerator and the denominator — not a 0, not rescaled", () => {
    // 18 and 55 average to 36.5 when ABSENT is excluded entirely.
    // If absent silently counted as 0 the mean would be (18+0+55)/3 = 24.33.
    const scores: DecidableScoreInput[] = [
      { rawScore: 18, isAbsent: false },
      { rawScore: null, isAbsent: true },
      { rawScore: 55, isAbsent: false },
    ];
    expect(computeEvaluationAverage(scores)).toBe(36.5);
  });

  it("returns 0 when every evaluation is absent", () => {
    const scores: DecidableScoreInput[] = [
      { rawScore: null, isAbsent: true },
      { rawScore: null, isAbsent: true },
    ];
    expect(computeEvaluationAverage(scores)).toBe(0);
  });

  it("returns 0 when nothing has been entered at all", () => {
    expect(computeEvaluationAverage([])).toBe(0);
  });

  it("excludes not-entered rows (rawScore null, isAbsent false) the same as it would if the row didn't exist", () => {
    const scores: DecidableScoreInput[] = [
      { rawScore: 10, isAbsent: false },
      { rawScore: null, isAbsent: false },
    ];
    expect(computeEvaluationAverage(scores)).toBe(10);
  });

  it("gives not-entered and absent the SAME average (both excluded), unlike a real 0", () => {
    const notEntered: DecidableScoreInput[] = [{ rawScore: 20, isAbsent: false }];
    const absent: DecidableScoreInput[] = [
      { rawScore: 20, isAbsent: false },
      { rawScore: null, isAbsent: true },
    ];
    const realZero: DecidableScoreInput[] = [
      { rawScore: 20, isAbsent: false },
      { rawScore: 0, isAbsent: false },
    ];
    expect(computeEvaluationAverage(notEntered)).toBe(computeEvaluationAverage(absent));
    expect(computeEvaluationAverage(realZero)).not.toBe(computeEvaluationAverage(absent));
    expect(computeEvaluationAverage(realZero)).toBe(10);
  });
});

describe("computeAssessmentClassStats — comparative analytics (SPEC_V0.7.md §4, step 5)", () => {
  it("computes average/best/worst over decided scores, unrestricted (staff — eligibleStudentIds: null)", () => {
    const rows: ClassScoreRow[] = [
      { studentId: "s1", rawScore: 60, isAbsent: false },
      { studentId: "s2", rawScore: 40, isAbsent: false },
      { studentId: "s3", rawScore: 80, isAbsent: false },
    ];
    expect(computeAssessmentClassStats(rows, null)).toEqual({ classAverageScore: 60, bestScore: 80, worstScore: 40 });
  });

  it("excludes a student NOT in the eligible set — the published-only filter, applied", () => {
    const rows: ClassScoreRow[] = [
      { studentId: "published1", rawScore: 60, isAbsent: false },
      { studentId: "published2", rawScore: 40, isAbsent: false },
      { studentId: "draftStudent", rawScore: 100, isAbsent: false }, // NOT eligible — must not move avg/best
    ];
    const eligible = new Set(["published1", "published2"]);
    expect(computeAssessmentClassStats(rows, eligible)).toEqual({ classAverageScore: 50, bestScore: 60, worstScore: 40 });
  });

  it("excludes absent rows from average AND best/worst, same as computeEvaluationAverage", () => {
    const rows: ClassScoreRow[] = [
      { studentId: "s1", rawScore: 60, isAbsent: false },
      { studentId: "s2", rawScore: null, isAbsent: true },
    ];
    expect(computeAssessmentClassStats(rows, null)).toEqual({ classAverageScore: 60, bestScore: 60, worstScore: 60 });
  });

  it("returns null (not 0) across all three when nothing decided survives the filter", () => {
    const rows: ClassScoreRow[] = [{ studentId: "onlyDraftStudent", rawScore: 90, isAbsent: false }];
    const eligible = new Set<string>(); // nobody eligible
    expect(computeAssessmentClassStats(rows, eligible)).toEqual({ classAverageScore: null, bestScore: null, worstScore: null });
    expect(computeAssessmentClassStats([], null)).toEqual({ classAverageScore: null, bestScore: null, worstScore: null });
  });
});
