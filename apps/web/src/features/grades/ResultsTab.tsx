import { useMemo, useState } from "react";
import type { ClassArmResultsSubject } from "@scholametric/shared";
import { Card, CardContent } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Spinner } from "../../components/ui/spinner";
import { Button } from "../../components/ui/button";
import { getErrorMessage } from "../../lib/api-client";
import { isSchoolAdmin, isProprietor } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyTeaching } from "../dashboard/use-my-teaching";
import { useAdminCurrentTerm } from "./use-admin-current-term";
import { useClassArmResults } from "./use-class-arm-results";
import {
  ClassArmResultsView,
  type OverridePermission,
  type OverrideTarget,
  type MarkAbsentTarget,
} from "./ClassArmResultsView";
import { OverrideGradeDialog } from "./OverrideGradeDialog";
import { MarkAbsentDialog } from "./MarkAbsentDialog";
import { PublishConfirmDialog } from "./PublishConfirmDialog";
import { UnpublishConfirmDialog } from "./UnpublishConfirmDialog";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-56";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

interface ResultsTabProps {
  classArmId: string;
  // v0.7.3 step 1 (SPEC_V0.7.3.md §2) — needed for the publish/unpublish
  // confirmation dialogs' description text. Passed down from
  // ClassGradesPage, which already computes it from its own
  // useClassArmDetail call — no new query here.
  armLabel: string;
}

// SPEC_V0.7.1.md §3 (item 5) — carried over from GradesOverviewPage, minus
// its free-roam "any class" dropdown: this tab lives INSIDE one specific
// class's Grades area now, so classArmId is fixed from the route, not
// re-pickable in-page. A DELIBERATE convenience trade for admins (who
// switch classes via the Classes list now, not an in-page dropdown) —
// see docs/DECISIONS.md. Term stays pickable (admin) / fixed-to-current
// (teacher), exactly as before — nothing about WHICH term's results you
// can see changed, only which class arm.
export function ResultsTab({ classArmId, armLabel }: ResultsTabProps) {
  const currentUserQuery = useCurrentUser();
  const currentUser = currentUserQuery.data;
  const isTeacher = currentUser?.role === "TEACHER";
  const isConfirmedAdmin =
    currentUser?.role === "SCHOOL_ADMIN" || currentUser?.role === "PROPRIETOR";

  const [termId, setTermId] = useState("");
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget | null>(
    null,
  );
  const [markAbsentTarget, setMarkAbsentTarget] =
    useState<MarkAbsentTarget | null>(null);
  // v0.7.3 step 1 (SPEC_V0.7.3.md §2) — publish/unpublish targets, teacher-
  // only (SPEC_V0.7.3.md §2 Q6: admin keeps using the separate Review &
  // Publish page, so these never get set for an admin viewer).
  const [publishTarget, setPublishTarget] =
    useState<ClassArmResultsSubject | null>(null);
  const [unpublishTarget, setUnpublishTarget] =
    useState<ClassArmResultsSubject | null>(null);

  const overridePermission: OverridePermission = isProprietor(currentUser?.role)
    ? "any"
    : isSchoolAdmin(currentUser?.role)
      ? "pendingOnly"
      : "none";
  const canMarkAbsent = isSchoolAdmin(currentUser?.role);

  const myTeaching = useMyTeaching();
  const adminTerm = useAdminCurrentTerm(isConfirmedAdmin);

  const effectiveTermId = isTeacher
    ? (myTeaching.data?.currentTermId ?? "")
    : termId || adminTerm.currentTermId || "";

  // v0.7.3 step 1 — which subjects THIS teacher may publish/unpublish
  // here: their own assigned subjects in THIS class arm, from the SAME
  // useMyTeaching() call already fetched for the term picker above — zero
  // new query. A class teacher sees every subject in ClassArmResultsView
  // (not just their own), so this cross-reference is what keeps the
  // button off a colleague's subject. Admin/proprietor never get a
  // populated set — undefined here means ClassArmResultsView shows the
  // control for nobody (SPEC_V0.7.3.md §2 Q6).
  const publishableSubjectIds = useMemo(() => {
    if (!isTeacher) return undefined;
    return new Set(
      (myTeaching.data?.subjects ?? [])
        .filter((s) => s.classArmId === classArmId)
        .map((s) => s.subjectId),
    );
  }, [isTeacher, myTeaching.data, classArmId]);
  const publishTermLabel =
    isTeacher && myTeaching.data?.currentTermName
      ? formatTermName(myTeaching.data.currentTermName)
      : "this term";

  const ready = Boolean(effectiveTermId);
  const resultsQuery = useClassArmResults(
    ready ? { classArmId, termId: effectiveTermId } : null,
  );

  return (
    <div>
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="results-term">Term</Label>
            {isTeacher ? (
              <p className="flex h-10 items-center text-sm text-text">
                {myTeaching.data?.currentTermName
                  ? formatTermName(myTeaching.data.currentTermName)
                  : "—"}
              </p>
            ) : (
              <select
                id="results-term"
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
        </CardContent>
      </Card>

      {!ready && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted">Choose a term to load results.</p>
          </CardContent>
        </Card>
      )}

      {ready && resultsQuery.isLoading && (
        <div className="flex items-center gap-2 p-10 text-sm text-muted">
          <Spinner /> Loading results…
        </div>
      )}

      {ready && resultsQuery.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">
              {getErrorMessage(resultsQuery.error, "Couldn't load results.")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => resultsQuery.refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {ready && resultsQuery.data && (
        <ClassArmResultsView
          data={resultsQuery.data}
          overridePermission={overridePermission}
          onOverride={setOverrideTarget}
          canMarkAbsent={canMarkAbsent}
          onMarkAbsent={setMarkAbsentTarget}
          publishableSubjectIds={publishableSubjectIds}
          onPublish={setPublishTarget}
          onUnpublish={setUnpublishTarget}
        />
      )}

      <OverrideGradeDialog
        target={overrideTarget}
        onClose={() => setOverrideTarget(null)}
      />
      <MarkAbsentDialog
        target={markAbsentTarget}
        onClose={() => setMarkAbsentTarget(null)}
      />
      <PublishConfirmDialog
        classArmName={armLabel}
        termLabel={publishTermLabel}
        subject={publishTarget}
        classArmId={classArmId}
        termId={effectiveTermId}
        onClose={() => setPublishTarget(null)}
      />
      <UnpublishConfirmDialog
        classArmName={armLabel}
        subject={unpublishTarget}
        classArmId={classArmId}
        termId={effectiveTermId}
        onClose={() => setUnpublishTarget(null)}
      />
    </div>
  );
}
