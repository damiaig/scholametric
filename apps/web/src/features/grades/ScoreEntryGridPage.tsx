import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Label } from "../../components/ui/label";
import { Spinner } from "../../components/ui/spinner";
import { Button } from "../../components/ui/button";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyTeaching } from "../dashboard/use-my-teaching";
import { useClassArmDetail } from "../classes/use-class-arm-detail";
import { useAssessmentComponents } from "../settings/use-assessment-components";
import { useAdminCurrentTerm } from "./use-admin-current-term";
import { ScoreEntryGrid } from "./ScoreEntryGrid";

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-56";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

// SPEC_V0.5.1.md §2.3, v0.5.1 step 3: class + subject are locked to
// whichever "Enter grades" link the caller arrived through
// (ClassArmDetailPage for admin/proprietor, MyClassesView for teacher) —
// rendered as a read-only context label, never pickers. Only component and
// term roam within that locked class+subject (they vary per grading job;
// class+subject roaming was the actual disorganization this finding fixes).
// The lock is UX, not the security boundary — GradesService's
// assertTeacherAssignment (v0.5.1 step 1) still rejects an unassigned/
// unauthorized class+subject regardless of how this page got there; a
// hand-edited URL just surfaces that rejection as a clean error below,
// same as any other failed load in this app.
export function ScoreEntryGridPage() {
  const { data: currentUser } = useCurrentUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTeacher = currentUser?.role === "TEACHER";
  const isConfirmedAdmin = currentUser?.role === "SCHOOL_ADMIN" || currentUser?.role === "PROPRIETOR";

  const classArmId = searchParams.get("classArmId") ?? "";
  const subjectId = searchParams.get("subjectId") ?? "";
  const [componentId, setComponentId] = useState("");
  const [termId, setTermId] = useState("");

  const hasLockedParams = Boolean(classArmId && subjectId);

  // No legitimate flow ever lands here without both params (every real
  // "Enter grades" link carries them) — a bare hit is a stale bookmark or
  // typed URL, not a free-roam entry point. Redirect (replace, so Back
  // doesn't bounce to the dead route) to wherever this caller's own real
  // "Enter grades" links actually live: MyClassesView (teacher) or the
  // Classes list (admin/proprietor, whose class-arm-detail page is where
  // the Enter-grades action lives — teacher's own class-arm-detail view has
  // no such action, see ClassArmDetailPage.tsx's canManage gate, so sending
  // a teacher there instead would be its own dead end).
  useEffect(() => {
    if (!hasLockedParams && currentUser) {
      navigate(currentUser.role === "TEACHER" ? "/dashboard" : "/classes", { replace: true });
    }
  }, [hasLockedParams, currentUser, navigate]);

  const armDetail = useClassArmDetail(hasLockedParams ? classArmId : undefined, 1, 1);
  const myTeaching = useMyTeaching();
  const components = useAssessmentComponents();
  const adminTerm = useAdminCurrentTerm(isConfirmedAdmin);

  const effectiveTermId = isTeacher ? (myTeaching.data?.currentTermId ?? "") : termId || adminTerm.currentTermId || "";
  const ready = Boolean(componentId && effectiveTermId && armDetail.data);

  if (!hasLockedParams) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Redirecting…
      </div>
    );
  }

  const armLabel = armDetail.data ? `${armDetail.data.classLevel.name} ${armDetail.data.name}` : "";
  const subjectLabel = armDetail.data?.subjectTeachers.find((entry) => entry.subjectId === subjectId)?.subjectName ?? "Subject";

  return (
    <div>
      <PageHeader title="Enter grades" description="Pick a component and term to load the entry grid." />

      {armDetail.isLoading ? (
        <div className="flex items-center gap-2 p-10 text-sm text-muted">
          <Spinner /> Loading class…
        </div>
      ) : armDetail.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-danger">{getErrorMessage(armDetail.error, "Couldn't load this class.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => armDetail.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-4 rounded-lg border border-muted/20 bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label>Class &amp; subject</Label>
              {/* SPEC_V0.5.1.md §2.6 — a bordered pill matching the height/
                  shape of the Component/Term controls beside it, so this
                  reads as intentionally fixed context, not a blank/broken
                  field. */}
              <p className="flex h-10 w-full items-center rounded-md border border-muted/30 bg-muted/5 px-3 text-sm font-medium text-text sm:w-56">
                {armLabel} · {subjectLabel}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grid-component">Component</Label>
              <select
                id="grid-component"
                className={SELECT_CLASS}
                value={componentId}
                onChange={(event) => setComponentId(event.target.value)}
                disabled={components.isLoading}
              >
                <option value="" disabled>
                  Select…
                </option>
                {(components.data ?? []).map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grid-term">Term</Label>
              {isTeacher ? (
                <p className="flex h-10 items-center text-sm text-text">
                  {myTeaching.data?.currentTermName ? formatTermName(myTeaching.data.currentTermName) : "—"}
                </p>
              ) : (
                <select
                  id="grid-term"
                  className={SELECT_CLASS}
                  value={effectiveTermId}
                  onChange={(event) => setTermId(event.target.value)}
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
              )}
            </div>
          </div>

          {ready ? (
            <ScoreEntryGrid
              params={{ classArmId, subjectId, componentId, termId: effectiveTermId }}
              canManageTermLock={isConfirmedAdmin}
            />
          ) : (
            <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
              Choose a component and term to load the grid.
            </p>
          )}
        </>
      )}
    </div>
  );
}
