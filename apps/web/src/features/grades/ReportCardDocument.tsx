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

// SPEC_V0.5.md §2.1/§2.4 — the same three-way distinction as the score-entry
// grid (ScoreEntryRow): isAbsent -> "Abs", null&&!isAbsent -> blank/not-
// entered ("—", never confused with a real 0), otherwise the real number.
function evaluationDisplay(evaluation: ReportCardEvaluation): string {
  if (evaluation.isAbsent) return "Abs";
  if (evaluation.rawScore === null) return "—";
  return formatScore(evaluation.rawScore);
}

interface ReportCardDocumentProps {
  data: ReportCardResponse;
  schoolName?: string;
  classArmLabel?: string | null;
  termLabel?: string | null;
  sessionLabel?: string | null;
  // Both default to read-only (v0.6 step 3's student self-view never
  // shows either write form — the read endpoint itself doesn't gate
  // remarks by role, only the write endpoints do, same "hidden not
  // disabled" pattern as a subject-only TEACHER).
  showTeacherForm?: boolean;
  showPrincipalForm?: boolean;
  // v0.7 step 3 (SPEC_V0.7.md §4) — who's asking, for the per-subject
  // "Show exams" button below (SubjectExamsPanel resolves the right
  // endpoint/published-only rule from this). Omitted entirely hides the
  // button — used nowhere in this app today, but keeps this component
  // usable in a context that doesn't have viewer identity to hand.
  examsViewer?: ExamsViewer;
}

// The printable document itself (SPEC_V0.5.md §2.4, v0.5 step 4) —
// extracted out of ReportCardPage.tsx (v0.6 step 3) so the SAME renderer
// backs both the staff view (ReportCardPage, its own term-picker/remark-
// write chrome around this) and a STUDENT's own read-only view
// (MyReportCardPage) without duplicating the subjects table/overall
// block. Purely presentational — no data fetching, no role branching
// beyond the two boolean form flags already passed in by the caller.
export function ReportCardDocument({
  data,
  schoolName,
  classArmLabel,
  termLabel,
  sessionLabel,
  showTeacherForm = false,
  showPrincipalForm = false,
  examsViewer,
}: ReportCardDocumentProps) {
  return (
    <Card className="mx-auto max-w-3xl text-text print:border-0 print:shadow-none">
      <CardContent className="p-6 print:p-0">
        <div className="mb-6 flex flex-col items-center gap-1 border-b border-muted/20 pb-4 text-center break-inside-avoid">
          <p className="text-lg font-semibold">{schoolName}</p>
          <p className="text-sm text-muted">Term Report Card</p>
          <p className="mt-2 text-xl font-semibold">
            {data.firstName} {data.lastName}
          </p>
          <p className="font-mono text-sm text-muted">{data.admissionNumber}</p>
          <p className="text-sm text-text">
            {classArmLabel ?? "—"} · {termLabel ?? "—"}
            {sessionLabel ? ` · ${sessionLabel}` : ""}
          </p>
        </div>

        {data.subjects.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No results entered for this term yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {data.subjects.map((subject) => (
              <Card
                key={subject.subjectId}
                className="break-inside-avoid shadow-none"
              >
                <CardContent className="p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-text">
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
                      <ClassAverageLabel value={subject.classAverageScore} />
                    </div>
                  </div>
                  {/* v0.7 step 4 (SPEC_V0.7.md §4) — each evaluation shown one
                      after another (Pronote-style), not collapsed into a fixed
                      CA1/CA2/Exam column set: a teacher can create arbitrarily
                      many, each with its own name/description. */}
                  {subject.evaluations.length > 0 ? (
                    <ul className="mb-2 flex flex-col gap-1 text-sm">
                      {subject.evaluations.map((evaluation) => (
                        <li
                          key={evaluation.evaluationId}
                          className="flex items-start justify-between gap-2"
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
                    <p className="mb-2 text-sm text-muted">
                      No evaluations entered for this subject yet.
                    </p>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-muted/20">
                          <th className="whitespace-nowrap px-2 py-1.5 font-medium text-muted">
                            Total
                          </th>
                          <th className="whitespace-nowrap px-2 py-1.5 font-medium text-muted">
                            Grade
                          </th>
                          <th className="whitespace-nowrap px-2 py-1.5 font-medium text-muted">
                            Position
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="whitespace-nowrap px-2 py-1.5 font-mono text-text">
                            {formatScore(subject.totalScore)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-text">
                            {subject.finalGrade ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                            {positionLabel(subject.subjectPosition)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {examsViewer && (
                    <SubjectExamsPanel
                      subjectId={subject.subjectId}
                      subjectName={subject.subjectName}
                      termId={data.termId}
                      sessionId={data.sessionId}
                      viewer={examsViewer}
                    />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="mt-4 break-inside-avoid shadow-none">
          <CardContent className="p-3">
            <p className="mb-1 font-medium text-text">Overall</p>
            {data.overall ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <p className="text-text">
                  {data.overall.averageGrade ?? "—"}{" "}
                  <span className="text-xs text-muted">
                    ({formatScore(data.overall.averageScore)})
                  </span>
                </p>
                <p className="text-muted">
                  {positionLabel(data.overall.overallPosition)}
                </p>
                <StatusBadge
                  label={resultStatusLabel(data.overall.status)}
                  tone={resultStatusTone(data.overall.status)}
                />
                <p className="text-xs text-muted">
                  {data.overall.subjectsCount} subject(s)
                </p>
                <ClassAverageLabel value={data.overall.generalClassAverage} />
              </div>
            ) : (
              <p className="text-sm text-muted">
                Overall results not yet available.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="mt-4 flex flex-col gap-4">
          <RemarkPanel
            label="Teacher remark"
            studentId={data.studentId}
            termId={data.termId}
            sessionId={data.sessionId}
            remark={data.remarks.teacherRemark}
            remarkBy={data.remarks.teacherRemarkBy}
            remarkAt={data.remarks.teacherRemarkAt}
            showForm={showTeacherForm}
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
            showForm={showPrincipalForm}
            field="principal"
          />
        </div>
      </CardContent>
    </Card>
  );
}
