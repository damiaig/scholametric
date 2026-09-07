import type {
  ReportCardEvaluation,
  ReportCardResponse,
} from "@scholametric/shared";
import { Card, CardContent } from "../../components/ui/card";
import { StatusBadge } from "../../components/StatusBadge";
import { resultStatusLabel, resultStatusTone } from "./result-status";
import { formatScore } from "./format-score";
import { RemarkPanel } from "./RemarkPanel";
import { SubjectExamsPanel, type ExamsViewer } from "./SubjectExamsPanel";
import { AssessmentClassStatsLabel, ClassAverageLabel } from "./ClassStats";

function positionLabel(position: number | null): string {
  return position === null ? "Not yet ranked" : `#${position}`;
}

function evaluationDisplay(evaluation: ReportCardEvaluation): string {
  if (evaluation.isAbsent) return "Abs";
  if (evaluation.rawScore === null) return "—";
  return formatScore(evaluation.rawScore);
}

interface StudentReportCardViewProps {
  data: ReportCardResponse;
  examsViewer: ExamsViewer;
}

// v0.7.2 step 3 (SPEC_V0.7.2.md §4) — the designed student/parent Grades
// page (Item 4), replacing the raw printable document for THIS viewer
// only. ReportCardDocument stays exactly as it was and keeps backing the
// staff/print view (ReportCardPage.tsx) — this component never touches
// it, so the restyle carries zero risk to printing/remark-writing. Same
// data (GET /me/report-card | /me/children/:id/report-card), same
// published-only wall, same anonymity rule — ClassAverageLabel/
// AssessmentClassStatsLabel are the SAME components ReportCardDocument
// uses, reused unchanged — just a different arrangement of the identical
// fields, plus the new runningAverageScore (SPEC_V0.7.2.md §2) in the
// summary strip. No identity header block (school/name/admission number)
// here — that information now lives in the page's own PageHeader
// (MyGradesPage.tsx), so it isn't shown twice. Remarks are always
// read-only in this view (both callers pass no write form), so there's
// no showTeacherForm/showPrincipalForm prop to carry.
export function StudentReportCardView({
  data,
  examsViewer,
}: StudentReportCardViewProps) {
  if (data.subjects.length === 0) {
    return (
      <Card className="border-muted/20 bg-card shadow-none">
        <CardContent className="p-10 text-center">
          <p className="text-sm text-muted">
            Not yet published — results appear here once your teacher
            publishes them.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-muted/20 border-l-4 border-l-primary bg-card shadow-none">
          <CardContent className="p-4">
            <p className="text-sm text-muted">Your average</p>
            <p className="text-2xl font-semibold text-primary">
              {data.runningAverageScore !== null
                ? formatScore(data.runningAverageScore)
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-muted/20 bg-card shadow-none">
          <CardContent className="p-4">
            <p className="text-sm text-muted">Class average</p>
            <p className="text-2xl font-semibold text-text">
              {data.runningClassAverageScore !== null
                ? formatScore(data.runningClassAverageScore)
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-muted/20 bg-card shadow-none">
          <CardContent className="p-4">
            <p className="text-sm text-muted">Position</p>
            <p className="text-2xl font-semibold text-text">
              {data.overall
                ? positionLabel(data.overall.overallPosition)
                : data.runningPosition !== null
                  ? positionLabel(data.runningPosition)
                  : "Not yet ranked"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {data.subjects.map((subject) => (
          <Card
            key={subject.subjectId}
            className="border-muted/20 bg-card shadow-none"
          >
            <CardContent className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-text">
                  {subject.subjectName}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {subject.needsTeacherAssignment && (
                    <StatusBadge
                      label="Needs a teacher assigned"
                      tone="warning"
                    />
                  )}
                  <StatusBadge
                    label={resultStatusLabel(subject.status)}
                    tone={resultStatusTone(subject.status)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span>
                  <span className="font-mono font-semibold text-text">
                    {formatScore(subject.totalScore)}
                  </span>
                  <span className="text-xs text-muted">/100</span>
                </span>
                <span className="text-text">{subject.finalGrade ?? "—"}</span>
                <span className="text-muted">
                  {positionLabel(subject.subjectPosition)}
                </span>
                <ClassAverageLabel value={subject.classAverageScore} />
              </div>

              {subject.evaluations.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2 border-t border-muted/10 pt-3 text-sm">
                  {subject.evaluations.map((evaluation) => (
                    <li
                      key={evaluation.evaluationId}
                      className="flex items-start justify-between gap-3"
                    >
                      <span className="flex flex-col">
                        <span className="text-text">{evaluation.name}</span>
                        {evaluation.description && (
                          <span className="text-xs text-muted">
                            {evaluation.description}
                          </span>
                        )}
                        <AssessmentClassStatsLabel
                          classAverageScore={evaluation.classAverageScore}
                          bestScore={evaluation.bestScore}
                          worstScore={evaluation.worstScore}
                        />
                      </span>
                      <span className="whitespace-nowrap font-mono text-text">
                        {evaluationDisplay(evaluation)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  No evaluations entered for this subject yet.
                </p>
              )}

              <SubjectExamsPanel
                subjectId={subject.subjectId}
                subjectName={subject.subjectName}
                termId={data.termId}
                sessionId={data.sessionId}
                viewer={examsViewer}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <RemarkPanel
          label="Teacher remark"
          studentId={data.studentId}
          termId={data.termId}
          sessionId={data.sessionId}
          remark={data.remarks.teacherRemark}
          remarkBy={data.remarks.teacherRemarkBy}
          remarkAt={data.remarks.teacherRemarkAt}
          showForm={false}
          field="teacher"
        />
        <RemarkPanel
          label="Principal remark"
          studentId={data.studentId}
          termId={data.termId}
          sessionId={data.sessionId}
          remark={data.remarks.principalRemark}
          remarkBy={data.remarks.principalRemarkBy}
          remarkAt={data.remarks.principalRemarkAt}
          showForm={false}
          field="principal"
        />
      </div>
    </div>
  );
}
