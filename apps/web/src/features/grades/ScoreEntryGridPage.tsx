import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Label } from "../../components/ui/label";
import { Spinner } from "../../components/ui/spinner";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyTeaching } from "../dashboard/use-my-teaching";
import { useClasses } from "../classes/use-classes";
import { useAllSubjects } from "../classes/use-subjects";
import { useAssessmentComponents } from "../settings/use-assessment-components";
import { useAdminCurrentTerm } from "./use-admin-current-term";
import { ScoreEntryGrid } from "./ScoreEntryGrid";

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-56";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

// The bulk score-entry grid's picker row + page shell (SPEC_V0.4.md §4
// item 1). TEACHER only ever sees their own assigned class+subject pairs
// (from GET /me/teaching) and a fixed current term — never a selection
// that would 403. SCHOOL_ADMIN/PROPRIETOR get full class/subject/term
// dropdowns.
export function ScoreEntryGridPage() {
  const { data: currentUser } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const isTeacher = currentUser?.role === "TEACHER";
  // Fail CLOSED, not open: before /auth/me resolves, currentUser is
  // undefined and role is unknown — default to "not admin" so the
  // admin-only sessions/terms queries stay disabled during that window,
  // rather than defaulting to "admin" and firing a doomed request for
  // whatever the caller turns out to be (isTeacher alone would do this,
  // since `!isTeacher` is true while role is still unknown).
  const isConfirmedAdmin = currentUser?.role === "SCHOOL_ADMIN" || currentUser?.role === "PROPRIETOR";

  const [classArmId, setClassArmId] = useState(searchParams.get("classArmId") ?? "");
  const [subjectId, setSubjectId] = useState(searchParams.get("subjectId") ?? "");
  const [componentId, setComponentId] = useState("");

  const myTeaching = useMyTeaching();
  const classes = useClasses();
  const subjects = useAllSubjects();
  const components = useAssessmentComponents();
  const adminTerm = useAdminCurrentTerm(isConfirmedAdmin);
  const [termId, setTermId] = useState("");

  const effectiveTermId = isTeacher ? (myTeaching.data?.currentTermId ?? "") : termId || adminTerm.currentTermId || "";

  const teacherPairs = myTeaching.data?.subjects ?? [];
  const teacherPairKey = (pair: { classArmId: string; subjectId: string }) => `${pair.classArmId}::${pair.subjectId}`;
  const selectedTeacherPairKey = classArmId && subjectId ? `${classArmId}::${subjectId}` : "";

  const classArmOptions = useMemo(
    () => (classes.data ?? []).flatMap((level) => level.arms.map((arm) => ({ id: arm.id, label: `${level.name} ${arm.name}` }))),
    [classes.data],
  );

  const ready = classArmId && subjectId && componentId && effectiveTermId;

  return (
    <div>
      <PageHeader title="Enter grades" description="Pick a class, subject, and component to load the entry grid." />

      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-muted/20 bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        {isTeacher ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grid-class-subject">Class &amp; subject</Label>
            {myTeaching.isLoading ? (
              <div className="flex h-10 items-center text-sm text-muted">
                <Spinner className="mr-2" /> Loading…
              </div>
            ) : teacherPairs.length === 0 ? (
              <p className="text-sm text-muted">You have no subject assignments this term.</p>
            ) : (
              <select
                id="grid-class-subject"
                className={SELECT_CLASS}
                value={selectedTeacherPairKey}
                onChange={(event) => {
                  const pair = teacherPairs.find((p) => teacherPairKey(p) === event.target.value);
                  setClassArmId(pair?.classArmId ?? "");
                  setSubjectId(pair?.subjectId ?? "");
                }}
              >
                <option value="" disabled>
                  Select…
                </option>
                {teacherPairs.map((pair) => (
                  <option key={teacherPairKey(pair)} value={teacherPairKey(pair)}>
                    {pair.subjectName} — {pair.className}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grid-class">Class</Label>
              <select
                id="grid-class"
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grid-subject">Subject</Label>
              <select
                id="grid-subject"
                className={SELECT_CLASS}
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                disabled={subjects.isLoading}
              >
                <option value="" disabled>
                  Select…
                </option>
                {(subjects.data ?? []).map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

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
        />
      ) : (
        <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
          Choose a class, subject, component, and term to load the grid.
        </p>
      )}
    </div>
  );
}
