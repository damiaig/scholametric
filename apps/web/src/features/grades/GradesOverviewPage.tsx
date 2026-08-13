import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Label } from "../../components/ui/label";
import { Spinner } from "../../components/ui/spinner";
import { Button } from "../../components/ui/button";
import { getErrorMessage } from "../../lib/api-client";
import { isSchoolAdmin, isProprietor } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyTeaching } from "../dashboard/use-my-teaching";
import { useClasses } from "../classes/use-classes";
import { useAdminCurrentTerm } from "./use-admin-current-term";
import { useClassArmResults } from "./use-class-arm-results";
import { ClassArmResultsView, type OverridePermission, type OverrideTarget } from "./ClassArmResultsView";
import { OverrideGradeDialog } from "./OverrideGradeDialog";

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-56";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

// Grades overview (SPEC_V0.4.md §4 item 2, step 5): per-subject and
// overall class picture for a class arm + term. TEACHER sees only their
// own assigned classes (a class arm they're the class-teacher of, or hold
// any subject assignment in); admin/owner see any class. Row-level
// filtering (which subjects, whether the overall column appears) happens
// server-side in GradesService.getClassArmResults() — this page just
// renders whatever comes back.
export function GradesOverviewPage() {
  const currentUserQuery = useCurrentUser();
  const currentUser = currentUserQuery.data;
  const [searchParams] = useSearchParams();
  const isTeacher = currentUser?.role === "TEACHER";
  // Fail closed while role is still unknown — same reasoning as
  // ScoreEntryGridPage (see its comment): `!isTeacher` is true on the
  // first render before /auth/me resolves, which would fire the
  // admin-only sessions/terms queries for a caller who isn't confirmed
  // admin yet.
  const isConfirmedAdmin = currentUser?.role === "SCHOOL_ADMIN" || currentUser?.role === "PROPRIETOR";
  // This page reuses the SAME "Class"/id="overview-class" label across
  // both the teacher and admin picker branches (unlike ScoreEntryGridPage,
  // which uses distinctly-labeled pickers per role) — so `isTeacher`
  // false-by-default-while-unknown doesn't just risk a doomed query here,
  // it risks rendering the WRONG branch's select under the right-looking
  // label for one tick. Render a neutral loading state instead of
  // defaulting into the admin branch while role is still unresolved.
  const roleKnown = !currentUserQuery.isLoading;

  const [classArmId, setClassArmId] = useState(searchParams.get("classArmId") ?? "");
  const [termId, setTermId] = useState("");
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget | null>(null);

  const overridePermission: OverridePermission = isProprietor(currentUser?.role)
    ? "any"
    : isSchoolAdmin(currentUser?.role)
      ? "pendingOnly"
      : "none";

  const myTeaching = useMyTeaching();
  const classes = useClasses();
  const adminTerm = useAdminCurrentTerm(isConfirmedAdmin);

  const effectiveTermId = isTeacher ? (myTeaching.data?.currentTermId ?? "") : termId || adminTerm.currentTermId || "";

  const teacherArmOptions = useMemo(() => {
    if (!myTeaching.data) return [];
    const byArm = new Map<string, string>();
    for (const entry of myTeaching.data.classTeacherOf) byArm.set(entry.classArmId, entry.className);
    for (const entry of myTeaching.data.subjects) byArm.set(entry.classArmId, entry.className);
    return [...byArm.entries()].map(([id, label]) => ({ id, label }));
  }, [myTeaching.data]);

  const classArmOptions = useMemo(
    () => (classes.data ?? []).flatMap((level) => level.arms.map((arm) => ({ id: arm.id, label: `${level.name} ${arm.name}` }))),
    [classes.data],
  );

  const ready = Boolean(classArmId && effectiveTermId);
  const resultsQuery = useClassArmResults(ready ? { classArmId, termId: effectiveTermId } : null);

  return (
    <div>
      <PageHeader title="Grades overview" description="Per-subject and overall results for a class and term." />

      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-muted/20 bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        {!roleKnown ? (
          <div className="flex h-10 items-center text-sm text-muted">
            <Spinner className="mr-2" /> Loading…
          </div>
        ) : isTeacher ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="overview-class">Class</Label>
            {myTeaching.isLoading ? (
              <div className="flex h-10 items-center text-sm text-muted">
                <Spinner className="mr-2" /> Loading…
              </div>
            ) : teacherArmOptions.length === 0 ? (
              <p className="text-sm text-muted">You have no class assignments this term.</p>
            ) : (
              <select id="overview-class" className={SELECT_CLASS} value={classArmId} onChange={(event) => setClassArmId(event.target.value)}>
                <option value="" disabled>
                  Select…
                </option>
                {teacherArmOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="overview-class">Class</Label>
            <select
              id="overview-class"
              className={SELECT_CLASS}
              value={classArmId}
              onChange={(event) => setClassArmId(event.target.value)}
              disabled={classes.isLoading}
            >
              <option value="" disabled>
                Select…
              </option>
              {classArmOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="overview-term">Term</Label>
          {!roleKnown ? (
            <div className="flex h-10 items-center text-sm text-muted">
              <Spinner className="mr-2" /> Loading…
            </div>
          ) : isTeacher ? (
            <p className="flex h-10 items-center text-sm text-text">
              {myTeaching.data?.currentTermName ? formatTermName(myTeaching.data.currentTermName) : "—"}
            </p>
          ) : (
            <select
              id="overview-term"
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

      {!ready && (
        <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
          Choose a class and term to load results.
        </p>
      )}

      {ready && resultsQuery.isLoading && (
        <div className="flex items-center gap-2 p-10 text-sm text-muted">
          <Spinner /> Loading results…
        </div>
      )}

      {ready && resultsQuery.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-danger">{getErrorMessage(resultsQuery.error, "Couldn't load results.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => resultsQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {ready && resultsQuery.data && (
        <ClassArmResultsView data={resultsQuery.data} overridePermission={overridePermission} onOverride={setOverrideTarget} />
      )}

      <OverrideGradeDialog target={overrideTarget} onClose={() => setOverrideTarget(null)} />
    </div>
  );
}
