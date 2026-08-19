import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Label } from "../../components/ui/label";
import { getErrorMessage } from "../../lib/api-client";
import { isSchoolAdmin } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyTeaching } from "../dashboard/use-my-teaching";
import { useClasses } from "../classes/use-classes";
import { useAdminCurrentTerm } from "./use-admin-current-term";
import { useReportCard } from "./use-report-card";
import { resultStatusLabel, resultStatusTone } from "./result-status";
import { formatScore } from "./format-score";
import { RemarkPanel } from "./RemarkPanel";
import type { ReportCardComponent } from "@scholametric/shared";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-56";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

function positionLabel(position: number | null): string {
  return position === null ? "Not yet ranked" : `#${position}`;
}

// SPEC_V0.5.md §2.1/§2.4 — the same three-way distinction as the score-entry
// grid (ScoreEntryRow): isAbsent -> "Abs", null&&!isAbsent -> blank/not-
// entered ("—", never confused with a real 0), otherwise the real number.
function componentDisplay(component: ReportCardComponent): string {
  if (component.isAbsent) return "Abs";
  if (component.rawScore === null) return "—";
  return formatScore(component.rawScore);
}

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

  // TEACHER is current-term-only, matching StudentResultsTab's existing
  // precedent (SPEC_V0.5.md §2.4 step 6, confirmed) — the backend already
  // permits reading any term's card, but no historical-term picker exists
  // anywhere in the app for a TEACHER yet; deferred, see docs/DECISIONS.md.
  const termId = isTeacher ? (myTeaching.data?.currentTermId ?? "") : adminTermId || adminTerm.currentTermId || "";
  const sessionId = isTeacher ? (myTeaching.data?.currentSessionId ?? "") : adminTerm.currentSessionId ?? "";
  const ready = Boolean(id && termId && sessionId);

  const reportCardQuery = useReportCard(ready ? { studentId: id!, termId, sessionId } : null);
  const data = reportCardQuery.data;

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
                value={termId}
                onChange={(event) => setAdminTermId(event.target.value)}
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
              </select>
            </div>
          )}

          <Button type="button" size="sm" disabled={!data} onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" aria-hidden="true" /> Print
          </Button>
        </div>
      </div>

      {!ready && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading…
        </div>
      )}

      {ready && reportCardQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading report card…
        </div>
      )}

      {ready && reportCardQuery.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center print:hidden">
          <p className="text-sm text-danger">{getErrorMessage(reportCardQuery.error, "Couldn't load this report card.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => reportCardQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {data && (
        <div className="mx-auto max-w-3xl rounded-lg border border-muted/20 bg-card p-6 text-text print:border-0 print:p-0 print:shadow-none">
          <div className="mb-6 flex flex-col items-center gap-1 border-b border-muted/20 pb-4 text-center break-inside-avoid">
            <p className="text-lg font-semibold">{currentUser?.school.name}</p>
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
            <p className="py-6 text-center text-sm text-muted">No results entered for this term yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {data.subjects.map((subject) => (
                <div key={subject.subjectId} className="break-inside-avoid rounded-lg border border-muted/20 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-text">{subject.subjectName}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {subject.needsTeacherAssignment && <StatusBadge label="Needs a teacher assigned" tone="warning" />}
                      <StatusBadge label={resultStatusLabel(subject.status)} tone={resultStatusTone(subject.status)} />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-muted/20">
                          {subject.components.map((component) => (
                            <th key={component.componentId} className="whitespace-nowrap px-2 py-1.5 font-medium text-muted">
                              {component.componentName} <span className="font-normal">(/{component.maxScore})</span>
                            </th>
                          ))}
                          <th className="whitespace-nowrap px-2 py-1.5 font-medium text-muted">Total</th>
                          <th className="whitespace-nowrap px-2 py-1.5 font-medium text-muted">Grade</th>
                          <th className="whitespace-nowrap px-2 py-1.5 font-medium text-muted">Position</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {subject.components.map((component) => (
                            <td key={component.componentId} className="whitespace-nowrap px-2 py-1.5 font-mono text-text">
                              {componentDisplay(component)}
                            </td>
                          ))}
                          <td className="whitespace-nowrap px-2 py-1.5 font-mono text-text">{formatScore(subject.totalScore)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-text">{subject.finalGrade ?? "—"}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-muted">{positionLabel(subject.subjectPosition)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 break-inside-avoid rounded-lg border border-muted/20 p-3">
            <p className="mb-1 font-medium text-text">Overall</p>
            {data.overall ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <p className="text-text">
                  {data.overall.averageGrade ?? "—"} <span className="text-xs text-muted">({formatScore(data.overall.averageScore)})</span>
                </p>
                <p className="text-muted">{positionLabel(data.overall.overallPosition)}</p>
                <StatusBadge label={resultStatusLabel(data.overall.status)} tone={resultStatusTone(data.overall.status)} />
                <p className="text-xs text-muted">{data.overall.subjectsCount} subject(s)</p>
              </div>
            ) : (
              <p className="text-sm text-muted">Overall results not yet available.</p>
            )}
          </div>

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
        </div>
      )}
    </div>
  );
}
