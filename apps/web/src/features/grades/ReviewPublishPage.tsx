import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Label } from "../../components/ui/label";
import { Spinner } from "../../components/ui/spinner";
import { Button } from "../../components/ui/button";
import { getErrorMessage } from "../../lib/api-client";
import { isProprietor } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { useClasses } from "../classes/use-classes";
import { useAdminCurrentTerm } from "./use-admin-current-term";
import { useGradesReview } from "./use-grades-review";
import { formatScore } from "./format-score";
import { PublishConfirmDialog } from "./PublishConfirmDialog";
import { UnpublishConfirmDialog } from "./UnpublishConfirmDialog";
import type { GradesReviewSubject } from "@scholametric/shared";

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-56";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

// Review & publish (SPEC_V0.4.md §4 item 3, step 5) — SCHOOL_ADMIN/
// PROPRIETOR only, no TEACHER path exists on GET /grades/review at all.
// No client-side route guard (none exists anywhere in this app — see
// docs/DECISIONS.md): the nav link to this page is admin/owner-only, and
// a direct hit by anyone else 403s from the API and renders through the
// same error state as any other failed load.
export function ReviewPublishPage() {
  const { data: currentUser } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const canUnpublish = isProprietor(currentUser?.role);

  const [classArmId, setClassArmId] = useState(searchParams.get("classArmId") ?? "");
  const [termId, setTermId] = useState("");
  const [publishTarget, setPublishTarget] = useState<GradesReviewSubject | null>(null);
  const [unpublishTarget, setUnpublishTarget] = useState<GradesReviewSubject | null>(null);

  const classes = useClasses();
  const adminTerm = useAdminCurrentTerm(true);
  const effectiveTermId = termId || adminTerm.currentTermId || "";

  const classArmOptions = useMemo(
    () => (classes.data ?? []).flatMap((level) => level.arms.map((arm) => ({ id: arm.id, label: `${level.name} ${arm.name}` }))),
    [classes.data],
  );
  const classArmName = classArmOptions.find((option) => option.id === classArmId)?.label ?? "this class";
  const termLabel = adminTerm.terms.find((term) => term.id === effectiveTermId)?.name;

  const ready = Boolean(classArmId && effectiveTermId);
  const reviewQuery = useGradesReview(ready ? { classArmId, termId: effectiveTermId } : null);

  return (
    <div>
      <PageHeader title="Review & publish" description="Review each subject's readiness and publish results per class and term." />

      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-muted/20 bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="review-class">Class</Label>
          <select
            id="review-class"
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
          <Label htmlFor="review-term">Term</Label>
          <select
            id="review-term"
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
        </div>
      </div>

      {!ready && (
        <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
          Choose a class and term to review.
        </p>
      )}

      {ready && reviewQuery.isLoading && (
        <div className="flex items-center gap-2 p-10 text-sm text-muted">
          <Spinner /> Loading review…
        </div>
      )}

      {ready && reviewQuery.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-danger">{getErrorMessage(reviewQuery.error, "Couldn't load the review.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => reviewQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {ready && reviewQuery.data && reviewQuery.data.subjects.length === 0 && (
        <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
          No subjects have any scores entered for this class and term yet.
        </p>
      )}

      {ready && reviewQuery.data && reviewQuery.data.subjects.length > 0 && (
        <div className="flex flex-col gap-3">
          {reviewQuery.data.subjects.map((subject) => (
            <div
              key={subject.subjectId}
              className="flex flex-col gap-3 rounded-lg border border-muted/20 bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-text">{subject.subjectName}</p>
                <p className="text-sm text-muted">
                  {subject.publishedCount} published · {subject.pendingApprovalCount} pending · {subject.draftCount} not yet
                  scored (of {subject.rosterSize})
                </p>
                <p className="text-sm text-text">
                  Class average: <span className="font-mono">{subject.averageGrade ?? "—"}</span>{" "}
                  <span className="text-xs text-muted">({formatScore(subject.averageScore)})</span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!subject.canPublish}
                  title={subject.canPublish ? undefined : "Nothing eligible to publish yet — no scores are pending approval."}
                  onClick={() => setPublishTarget(subject)}
                >
                  Publish
                </Button>
                {canUnpublish && subject.publishedCount > 0 && (
                  <Button type="button" size="sm" variant="outline" className="text-danger hover:bg-danger/10" onClick={() => setUnpublishTarget(subject)}>
                    Unpublish
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <PublishConfirmDialog
        classArmName={classArmName}
        termLabel={termLabel ? formatTermName(termLabel) : "this term"}
        subject={publishTarget}
        classArmId={classArmId}
        termId={effectiveTermId}
        onClose={() => setPublishTarget(null)}
      />
      <UnpublishConfirmDialog
        classArmName={classArmName}
        subject={unpublishTarget}
        classArmId={classArmId}
        termId={effectiveTermId}
        onClose={() => setUnpublishTarget(null)}
      />
    </div>
  );
}
