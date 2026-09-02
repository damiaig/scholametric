import type { ReportCardResponse, YearExamsResponse } from "@scholametric/shared";

export interface GradeRow {
  key: string;
  name: string;
  subjectName: string;
  type: "Evaluation" | "Exam";
  rawScore: number | null;
  isAbsent: boolean;
  classAverageScore: number | null;
}

// SPEC_V0.7.1.md §3 (item 2.1/4.9) — "Your grades" (deliberately NOT
// "Recent grades": neither ReportCardEvaluation nor StudentExamRow carries
// a timestamp, so there is no true cross-subject chronological order to
// sort by — only within-subject order, which the backend already returns
// oldest-first. This takes the LAST (most recent) evaluation and the LAST
// exam per subject and merges them — "your most recent grade in each
// subject," not a real global recency feed. A true recency feed needs a
// timestamp field on these rows — deferred (docs/DECISIONS.md), not built
// here. Deterministic tie-break (no real ordering to fall back on):
// subject name, then Evaluation before Exam.
export function buildGradesBySubject(
  reportCard: ReportCardResponse | undefined,
  currentTermExams: YearExamsResponse["terms"][number] | undefined,
): GradeRow[] {
  const rows: GradeRow[] = [];

  for (const subject of reportCard?.subjects ?? []) {
    const last = subject.evaluations[subject.evaluations.length - 1];
    if (!last) continue;
    rows.push({
      key: `eval:${last.evaluationId}`,
      name: last.name,
      subjectName: subject.subjectName,
      type: "Evaluation",
      rawScore: last.rawScore,
      isAbsent: last.isAbsent,
      classAverageScore: last.classAverageScore,
    });
  }

  for (const subject of currentTermExams?.subjects ?? []) {
    const last = subject.exams[subject.exams.length - 1];
    if (!last) continue;
    rows.push({
      key: `exam:${last.examId}`,
      name: last.name,
      subjectName: subject.subjectName,
      type: "Exam",
      rawScore: last.rawScore,
      isAbsent: last.isAbsent,
      classAverageScore: last.classAverageScore,
    });
  }

  return rows.sort((a, b) => a.subjectName.localeCompare(b.subjectName) || a.type.localeCompare(b.type));
}
