import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { StatusBadge } from "../../components/StatusBadge";
import { getErrorMessage } from "../../lib/api-client";
import { resultStatusLabel, resultStatusTone } from "./result-status";
import { formatScore } from "./format-score";
import { useStudentExams } from "./use-student-exams";
import { useMyExams } from "./use-my-exams";
import { useChildExams } from "./use-child-exams";

export type ExamsViewer = { kind: "staff"; studentId: string } | { kind: "self" } | { kind: "child"; childId: string };

interface SubjectExamsPanelProps {
  subjectId: string;
  subjectName: string;
  termId: string;
  sessionId: string;
  viewer: ExamsViewer;
}

// v0.7 step 3 (SPEC_V0.7.md §4) — the per-term "Show exams" button.
// Collapsed by default and fetched lazily only once expanded — Track B is
// shown SEPARATELY from the evaluation average above it, never folded in
// (this panel never touches ReportCardDocument's own subject/components
// rendering, purely additive). All three read hooks are ALWAYS called
// (React's rules of hooks forbid calling one conditionally); only the one
// matching `viewer.kind`, and only once `open`, is actually enabled.
export function SubjectExamsPanel({ subjectId, subjectName, termId, sessionId, viewer }: SubjectExamsPanelProps) {
  const [open, setOpen] = useState(false);

  const staffQuery = useStudentExams(
    open && viewer.kind === "staff" ? { studentId: viewer.studentId, subjectId, termId, sessionId } : null,
  );
  const selfQuery = useMyExams(open && viewer.kind === "self" ? { subjectId, termId, sessionId } : null);
  const childQuery = useChildExams(
    open && viewer.kind === "child" ? { childId: viewer.childId, subjectId, termId, sessionId } : null,
  );
  const query = viewer.kind === "staff" ? staffQuery : viewer.kind === "self" ? selfQuery : childQuery;

  return (
    <div className="mt-2 border-t border-muted/10 pt-2 print:hidden">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronUp className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
        {open ? "Hide exams" : "Show exams"}
      </Button>

      {open && query.isLoading && (
        <div className="mt-2 flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading exams…
        </div>
      )}

      {open && query.isError && <p className="mt-2 text-sm text-danger">{getErrorMessage(query.error, "Couldn't load exams.")}</p>}

      {open && query.data && query.data.exams.length === 0 && (
        <p className="mt-2 text-sm text-muted">No exams for {subjectName} this term yet.</p>
      )}

      {open && query.data && query.data.exams.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          <ul className="flex flex-col gap-1 text-sm">
            {query.data.exams.map((exam) => (
              <li key={exam.examId} className="flex items-center justify-between gap-2">
                <span className="text-text">{exam.name}</span>
                <span className="font-mono text-text">{exam.isAbsent ? "Abs" : exam.rawScore === null ? "—" : formatScore(exam.rawScore)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Exam average:</span>
            <span className="font-mono text-text">
              {query.data.subjectExamAverage === null ? "—" : formatScore(query.data.subjectExamAverage)}
            </span>
            <span className="text-text">{query.data.subjectExamGrade ?? "—"}</span>
            {query.data.status && <StatusBadge label={resultStatusLabel(query.data.status)} tone={resultStatusTone(query.data.status)} />}
          </div>
        </div>
      )}
    </div>
  );
}
