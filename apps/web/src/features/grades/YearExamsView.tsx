import type { YearExamsResponse } from "@scholametric/shared";
import { StatusBadge } from "../../components/StatusBadge";
import { resultStatusLabel, resultStatusTone } from "./result-status";
import { formatScore } from "./format-score";
import { AssessmentClassStatsLabel, ClassAverageLabel } from "./ClassStats";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

function positionLabel(position: number | null): string {
  return position === null ? "Not yet ranked" : `#${position}`;
}

interface YearExamsViewProps {
  data: YearExamsResponse;
}

// v0.7 step 3 (SPEC_V0.7.md §4) — the dedicated year-long Exams view, a
// 4th entry alongside Term 1/2/3 in every term selector this app has
// (ReportCardPage for staff, StudentPortalHome/ParentPortalHome for
// self/child — one component, reused across all three, per the approved
// plan). Purely presentational, same convention as ReportCardDocument —
// no data fetching here; the caller already resolved which of
// useStudentYearExams/useMyYearExams/useChildYearExams applies. Every
// term the student was enrolled in this session gets an entry, empty or
// not — a "partially published year" (some terms/subjects visible, some
// not) is a normal render, never an error state.
export function YearExamsView({ data }: YearExamsViewProps) {
  return (
    <div className="flex flex-col gap-4">
      {data.terms.length === 0 && (
        <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
          No terms yet this session.
        </p>
      )}

      {data.terms.map((term) => (
        <div key={term.termId} className="break-inside-avoid rounded-lg border border-muted/20 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-text">{formatTermName(term.termName)}</p>
            {term.status && <StatusBadge label={resultStatusLabel(term.status)} tone={resultStatusTone(term.status)} />}
          </div>

          {term.subjects.length === 0 ? (
            <p className="text-sm text-muted">No exams published for this term yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {term.subjects.map((subject) => (
                <div key={subject.subjectId} className="rounded-md border border-muted/10 p-2">
                  <p className="mb-1 text-sm font-medium text-text">{subject.subjectName}</p>
                  <ul className="flex flex-col gap-0.5 text-sm">
                    {subject.exams.map((exam) => (
                      <li key={exam.examId} className="flex items-start justify-between gap-2">
                        <span className="flex flex-col">
                          <span className="text-text">{exam.name}</span>
                          <AssessmentClassStatsLabel classAverageScore={exam.classAverageScore} bestScore={exam.bestScore} worstScore={exam.worstScore} />
                        </span>
                        <span className="font-mono text-text">
                          {exam.isAbsent ? "Abs" : exam.rawScore === null ? "—" : formatScore(exam.rawScore)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>
                      Subject average:{" "}
                      <span className="font-mono text-text">
                        {subject.subjectExamAverage === null ? "—" : formatScore(subject.subjectExamAverage)}
                      </span>{" "}
                      {subject.subjectExamGrade ?? ""}
                    </span>
                    <ClassAverageLabel value={subject.classAverageScore} />
                  </p>
                </div>
              ))}
            </div>
          )}

          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text">
            <span>
              Term exam average:{" "}
              <span className="font-mono">{term.termExamAverage === null ? "—" : formatScore(term.termExamAverage)}</span>{" "}
              {term.termExamGrade ?? "—"} <span className="text-muted">{positionLabel(term.termExamPosition)}</span>
            </span>
            <ClassAverageLabel value={term.classAverageScore} />
          </p>
        </div>
      ))}

      <div className="break-inside-avoid rounded-lg border border-muted/20 p-3">
        <p className="mb-1 font-medium text-text">Overall exam average</p>
        {data.overallExamAverage === null ? (
          <p className="text-sm text-muted">Not yet available.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <p className="text-text">
              {data.overallExamGrade ?? "—"} <span className="text-xs text-muted">({formatScore(data.overallExamAverage)})</span>
            </p>
            <p className="text-muted">{positionLabel(data.yearExamPosition)}</p>
            <p className="text-xs text-muted">{data.termsCount} term(s)</p>
            <ClassAverageLabel value={data.generalClassAverage} />
          </div>
        )}
      </div>
    </div>
  );
}
