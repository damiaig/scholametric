import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Spinner } from "../../components/ui/spinner";
import { Button } from "../../components/ui/button";
import { getErrorMessage } from "../../lib/api-client";
import { isProprietor } from "../../lib/roles";
import { StatusBadge, type BadgeTone } from "../../components/StatusBadge";
import { useCurrentUser } from "../shell/use-current-user";
import { useClasses } from "../classes/use-classes";
import { useAdminCurrentTerm } from "./use-admin-current-term";
import { useGradesReview } from "./use-grades-review";
import { formatScore } from "./format-score";
import { PublishConfirmDialog } from "./PublishConfirmDialog";
import { UnpublishConfirmDialog } from "./UnpublishConfirmDialog";
import type { GradesReviewSubject } from "@scholametric/shared";

// v0.7.1 step 4 (SPEC_V0.7.1.md §4.2, item 10) — a per-subject "at a
// glance" rollup, entirely derived from fields GET /grades/review ALREADY
// returns (publishedCount/rosterSize/canPublish) — no new query, no
// school-wide fan-out (that's the admin-dashboard card we explicitly held,
// see docs/DECISIONS.md). This is the legitimate per-subject version of
// the same three-tier language.
function subjectPublishTier(subject: GradesReviewSubject): {
  label: string;
  tone: BadgeTone;
} {
  if (subject.rosterSize === 0)
    return { label: "No students", tone: "neutral" };
  if (subject.publishedCount === subject.rosterSize)
    return { label: "Published", tone: "success" };
  if (subject.canPublish)
    return { label: "Waiting to publish", tone: "warning" };
  return { label: "Still in draft", tone: "neutral" };
}

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-56";

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

  const [classArmId, setClassArmId] = useState(
    searchParams.get("classArmId") ?? "",
  );
  const [termId, setTermId] = useState("");
  const [publishTarget, setPublishTarget] =
    useState<GradesReviewSubject | null>(null);
  const [unpublishTarget, setUnpublishTarget] =
    useState<GradesReviewSubject | null>(null);

  const classes = useClasses();
  const adminTerm = useAdminCurrentTerm(true);
  const effectiveTermId = termId || adminTerm.currentTermId || "";

  const classArmOptions = useMemo(
    () =>
      (classes.data ?? []).flatMap((level) =>
        level.arms.map((arm) => ({
          id: arm.id,
          label: `${level.name} ${arm.name}`,
        })),
      ),
    [classes.data],
  );
  const classArmName =
    classArmOptions.find((option) => option.id === classArmId)?.label ??
    "this class";
  const termLabel = adminTerm.terms.find(
    (term) => term.id === effectiveTermId,
  )?.name;

  const ready = Boolean(classArmId && effectiveTermId);
  const reviewQuery = useGradesReview(
    ready ? { classArmId, termId: effectiveTermId } : null,
  );

  return (
    <div>
      <PageHeader
        title="Review & publish"
        description="Review each subject's readiness and publish results per class and term."
      />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end">
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
        </CardContent>
      </Card>

      {!ready && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted">
              Choose a class and term to review.
            </p>
          </CardContent>
        </Card>
      )}

      {ready && reviewQuery.isLoading && (
        <div className="flex items-center gap-2 p-10 text-sm text-muted">
          <Spinner /> Loading review…
        </div>
      )}

      {ready && reviewQuery.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">
              {getErrorMessage(reviewQuery.error, "Couldn't load the review.")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => reviewQuery.refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {ready && reviewQuery.data && reviewQuery.data.subjects.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted">
              No subjects have any scores entered for this class and term yet.
            </p>
          </CardContent>
        </Card>
      )}

      {ready && reviewQuery.data && reviewQuery.data.subjects.length > 0 && (
        <div className="flex flex-col gap-3">
          {reviewQuery.data.subjects.map((subject) => {
            const tier = subjectPublishTier(subject);
            return (
              <Card key={subject.subjectId}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium text-text">
                      {subject.subjectName}
                      <StatusBadge label={tier.label} tone={tier.tone} />
                      {subject.needsTeacherAssignment && (
                        <StatusBadge
                          label="Needs a teacher assigned"
                          tone="warning"
                        />
                      )}
                    </p>
                    <p className="text-sm text-muted">
                      <span className="font-semibold text-success">
                        {subject.publishedCount} published
                      </span>{" "}
                      ·{" "}
                      <span className="font-semibold text-warning">
                        {subject.pendingApprovalCount} pending
                      </span>{" "}
                      ·{" "}
                      <span className="font-semibold text-muted">
                        {subject.draftCount} not yet scored
                      </span>{" "}
                      (of {subject.rosterSize})
                    </p>
                    <p className="text-sm text-text">
                      Class average:{" "}
                      <span className="font-mono">
                        {subject.averageGrade ?? "—"}
                      </span>{" "}
                      <span className="text-xs text-muted">
                        ({formatScore(subject.averageScore)})
                      </span>
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!subject.canPublish}
                      title={
                        subject.canPublish
                          ? undefined
                          : "Nothing eligible to publish yet — either no scores are pending approval, or some students still have a blank component."
                      }
                      onClick={() => setPublishTarget(subject)}
                    >
                      Publish
                    </Button>
                    {canUnpublish && subject.publishedCount > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-danger hover:bg-danger/10"
                        onClick={() => setUnpublishTarget(subject)}
                      >
                        Unpublish
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
