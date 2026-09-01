import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { Label } from "../../components/ui/label";
import { getErrorMessage } from "../../lib/api-client";
import { isSchoolAdmin } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyTeaching } from "../dashboard/use-my-teaching";
import { useClasses } from "../classes/use-classes";
import { useAdminCurrentTerm } from "./use-admin-current-term";
import { useReportCard } from "./use-report-card";
import { useStudentYearExams } from "./use-student-year-exams";
import { ReportCardDocument } from "./ReportCardDocument";
import { YearExamsView } from "./YearExamsView";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-56";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

// v0.7 step 3 (SPEC_V0.7.md §4) — the year-long Exams view is a 4th entry
// in the SAME admin term selector below (confirmed: staff gets it too,
// reusing one YearExamsView — no separate route). TEACHER has no term
// selector at all on this page (current-term-only, pre-existing
// limitation noted above) so this entry is admin-only, same as the
// selector itself.
const EXAMS_OPTION_VALUE = "__exams__";

// Printable per-student term report card (SPEC_V0.5.md §2.4, v0.5 step 6).
// A dedicated route (not a StudentDetailPage tab) — printing wants a
// focused, chrome-free document, and this page needs its own term/session
// picker (a report card is most often printed for whichever term just
// closed, not "current term" the way the Results tab is scoped). Reached
// from StudentResultsTab's "Print report card" button (pre-filled via
// ?termId=&sessionId=) and directly linkable/bookmarkable.
export function ReportCardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: currentUser } = useCurrentUser();
  const isTeacher = currentUser?.role === "TEACHER";
  // Fail closed before /auth/me resolves — same reasoning as
  // ScoreEntryGridPage's isConfirmedAdmin (avoids a doomed admin-only
  // request firing for a role that turns out not to be admin).
  const isConfirmedAdmin = isSchoolAdmin(currentUser?.role);

  const myTeaching = useMyTeaching();
  const adminTerm = useAdminCurrentTerm(isConfirmedAdmin);
  const classes = useClasses();
  const [adminTermId, setAdminTermId] = useState(searchParams.get("termId") ?? "");
  const [viewMode, setViewMode] = useState<"term" | "exams">("term");

  // TEACHER is current-term-only, matching StudentResultsTab's existing
  // precedent (SPEC_V0.5.md §2.4 step 6, confirmed) — the backend already
  // permits reading any term's card, but no historical-term picker exists
  // anywhere in the app for a TEACHER yet; deferred, see docs/DECISIONS.md.
  const termId = isTeacher ? (myTeaching.data?.currentTermId ?? "") : adminTermId || adminTerm.currentTermId || "";
  const sessionId = isTeacher ? (myTeaching.data?.currentSessionId ?? "") : adminTerm.currentSessionId ?? "";
  const ready = Boolean(id && termId && sessionId);

  const reportCardQuery = useReportCard(viewMode === "term" && ready ? { studentId: id!, termId, sessionId } : null);
  const data = reportCardQuery.data;
  const yearExams = useStudentYearExams(
    viewMode === "exams" && id && adminTerm.currentSessionId ? { studentId: id, sessionId: adminTerm.currentSessionId } : null,
  );

  function handleTermSelectChange(value: string) {
    if (value === EXAMS_OPTION_VALUE) {
      setViewMode("exams");
      return;
    }
    setViewMode("term");
    setAdminTermId(value);
  }

  const classArmLabel =
    data &&
    (classes.data ?? [])
      .flatMap((level) => level.arms.map((arm) => ({ id: arm.id, label: `${level.name} ${arm.name}` })))
      .find((option) => option.id === data.classArmId)?.label;

  const termLabel = isTeacher
    ? myTeaching.data?.currentTermName
      ? formatTermName(myTeaching.data.currentTermName)
      : null
    : adminTerm.terms.find((t) => t.id === termId)
      ? formatTermName(adminTerm.terms.find((t) => t.id === termId)!.name)
      : null;
  const sessionLabel = isConfirmedAdmin ? adminTerm.sessions.find((s) => s.id === sessionId)?.name : null;

  // A subject-only TEACHER (any relationship short of class-teacher) gets
  // neither remark form — read-only remark text still renders below,
  // matching the standing "hidden, not disabled" RBAC pattern. Admin/
  // proprietor gets BOTH forms (backend allows it — the real workflow is a
  // principal completing a card when the class teacher hasn't yet); when
  // an admin writes the teacher remark, it's stamped with THEIR name, so
  // the form copy below says "Teacher remark," never "write as the class
  // teacher."
  const isClassTeacherHere =
    isTeacher && data ? (myTeaching.data?.classTeacherOf ?? []).some((c) => c.classArmId === data.classArmId && c.sessionId === data.sessionId) : false;
  const showTeacherForm = isConfirmedAdmin || isClassTeacherHere;
  const showPrincipalForm = isConfirmedAdmin;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-4 print:hidden sm:flex-row sm:items-end sm:justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)}>
          Back
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          {isConfirmedAdmin && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-card-term">Term</Label>
              <select
                id="report-card-term"
                className={SELECT_CLASS}
                value={viewMode === "exams" ? EXAMS_OPTION_VALUE : termId}
                onChange={(event) => handleTermSelectChange(event.target.value)}
                disabled={adminTerm.isLoading}
              >
                <option value="" disabled>
                  Select…
                </option>
                {adminTerm.terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {formatTermName(term.name)}
                    {term.isCurrent ? " (current)" : ""}
                  </option>
                ))}
                <option value={EXAMS_OPTION_VALUE}>Exams</option>
              </select>
            </div>
          )}

          <Button type="button" size="sm" disabled={viewMode === "term" ? !data : !yearExams.data} onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" aria-hidden="true" /> Print
          </Button>
        </div>
      </div>

      {viewMode === "term" && !ready && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading…
        </div>
      )}

      {viewMode === "term" && ready && reportCardQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading report card…
        </div>
      )}

      {viewMode === "term" && ready && reportCardQuery.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center print:hidden">
          <p className="text-sm text-danger">{getErrorMessage(reportCardQuery.error, "Couldn't load this report card.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => reportCardQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {viewMode === "exams" && yearExams.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading exams…
        </div>
      )}

      {viewMode === "exams" && yearExams.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center print:hidden">
          <p className="text-sm text-danger">{getErrorMessage(yearExams.error, "Couldn't load exams.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => yearExams.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {viewMode === "exams" && yearExams.data && <YearExamsView data={yearExams.data} />}

      {viewMode === "term" && data && (
        <ReportCardDocument
          data={data}
          schoolName={currentUser?.school.name}
          classArmLabel={classArmLabel}
          termLabel={termLabel}
          sessionLabel={sessionLabel}
          showTeacherForm={showTeacherForm}
          showPrincipalForm={showPrincipalForm}
          examsViewer={{ kind: "staff", studentId: id! }}
        />
      )}
    </div>
  );
}
