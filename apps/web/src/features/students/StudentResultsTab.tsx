import { useNavigate } from "react-router-dom";
import { Printer } from "lucide-react";
import { Spinner } from "../../components/ui/spinner";
import { Button } from "../../components/ui/button";
import { StatusBadge } from "../../components/StatusBadge";
import { ApiError, getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyTeaching } from "../dashboard/use-my-teaching";
import { useAdminCurrentTerm } from "../grades/use-admin-current-term";
import { useStudentResults } from "../grades/use-student-results";
import { resultStatusTone, resultStatusLabel } from "../grades/result-status";
import { formatScore } from "../grades/format-score";

interface StudentResultsTabProps {
  studentId: string;
}

function positionLabel(position: number | null): string {
  return position === null ? "Not yet ranked" : `#${position}`;
}

// Results tab (SPEC_V0.4.md §4 item 4, step 5) — current term only for
// v0.4 (no historical term picker; not asked for in this step's scope).
// TEACHER access is a plain allow/deny server-side (any relationship to
// the student's class arm — deliberately not filtered per subject, see
// GradesService.getStudentResults()'s doc comment); a teacher with no
// relationship gets a 403, rendered here as a graceful in-tab message —
// this page itself has no per-relationship gating (students.service.ts's
// findOne is intentionally unchanged, out of scope for this step), so the
// tab can be reached and must fail softly, not blank or crash.
export function StudentResultsTab({ studentId }: StudentResultsTabProps) {
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const isTeacher = currentUser?.role === "TEACHER";
  const isConfirmedAdmin = currentUser?.role === "SCHOOL_ADMIN" || currentUser?.role === "PROPRIETOR";

  const myTeaching = useMyTeaching();
  const adminTerm = useAdminCurrentTerm(isConfirmedAdmin);

  const sessionId = isTeacher ? myTeaching.data?.currentSessionId : adminTerm.currentSessionId;
  const termId = isTeacher ? myTeaching.data?.currentTermId : adminTerm.currentTermId;
  const ready = Boolean(sessionId && termId);

  const resultsQuery = useStudentResults(ready ? { studentId, sessionId: sessionId!, termId: termId! } : null);

  if (!ready) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading current term…
      </div>
    );
  }

  if (resultsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading results…
      </div>
    );
  }

  if (resultsQuery.isError) {
    const isForbidden = resultsQuery.error instanceof ApiError && resultsQuery.error.status === 403;
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
        <p className="text-sm text-danger">
          {isForbidden
            ? "You don't have access to this student's results."
            : getErrorMessage(resultsQuery.error, "Couldn't load results.")}
        </p>
        {!isForbidden && (
          <Button type="button" variant="outline" size="sm" onClick={() => resultsQuery.refetch()}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  const data = resultsQuery.data;
  if (!data || data.subjects.length === 0) {
    return <p className="text-sm text-muted">No results entered for this term yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate(`/students/${studentId}/report-card?termId=${termId}&sessionId=${sessionId}`)}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" /> Print report card
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-muted/20 bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-muted/20">
              <th className="whitespace-nowrap px-4 py-3 font-medium text-muted">Subject</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-muted">Grade</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-muted">Class average</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-muted">Position</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-muted">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.subjects.map((subject) => (
              <tr key={subject.subjectId} className="border-b border-muted/10 last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-text">{subject.subjectName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-text">
                  {subject.finalGrade ?? "—"} <span className="text-xs text-muted">({formatScore(subject.totalScore)})</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text">
                  {subject.classAverageGrade ?? "—"} <span className="text-xs text-muted">({formatScore(subject.classAverageScore)})</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{positionLabel(subject.subjectPosition)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge label={resultStatusLabel(subject.status)} tone={resultStatusTone(subject.status)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-muted/20 bg-card p-4">
        <p className="text-sm font-medium text-text">Overall</p>
        {data.overall ? (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="text-text">
              {data.overall.averageGrade ?? "—"} <span className="text-xs text-muted">({formatScore(data.overall.averageScore)})</span>
            </p>
            <p className="text-sm text-muted">{positionLabel(data.overall.overallPosition)}</p>
            <StatusBadge label={resultStatusLabel(data.overall.status)} tone={resultStatusTone(data.overall.status)} />
            <p className="text-xs text-muted">{data.overall.subjectsCount} subject(s)</p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">No results yet.</p>
        )}
      </div>
    </div>
  );
}
