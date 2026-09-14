import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Spinner } from "../../components/ui/spinner";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { StatusBadge, type BadgeTone } from "../../components/StatusBadge";
import { useClasses } from "../classes/use-classes";
import { useAdminCurrentTerm } from "./use-admin-current-term";
import { useExamsReview } from "./use-exams-review";
import { useApproveExam } from "./use-approve-exam";
import { useRejectExam } from "./use-reject-exam";
import { formatScore } from "./format-score";
import type { ExamReviewSubject } from "@scholametric/shared";

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — a per-subject rollup, same shape as
// ReviewPublishPage's subjectPublishTier but for the exam track's own
// pending-approvals surface. A DELIBERATELY SEPARATE page from
// ReviewPublishPage (not a second tab on it) — that page was just made
// pure read-only one step ago (v0.7.4 step 1); reintroducing action
// buttons there would re-contaminate it.
function examApprovalTier(subject: ExamReviewSubject): { label: string; tone: BadgeTone } {
  if (subject.rosterSize === 0) return { label: "No students", tone: "neutral" };
  if (subject.publishedCount === subject.rosterSize) return { label: "Published", tone: "success" };
  if (subject.pendingApprovalCount > 0) return { label: "Pending approval", tone: "warning" };
  if (subject.publishedCount > 0) return { label: "Partially published", tone: "success" };
  return { label: "Still in draft", tone: "neutral" };
}

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-56";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

// Exam approvals (SPEC_V0.7.4.md §3, v0.7.4 step 2) — SCHOOL_ADMIN/
// PROPRIETOR only, no TEACHER path exists on GET /exams/review at all.
// No client-side route guard (none exists anywhere in this app — see
// docs/DECISIONS.md): the nav link to this page is admin/owner-only, and
// a direct hit by anyone else 403s from the API and renders through the
// same error state as any other failed load.
export function ExamApprovalsPage() {
  const [searchParams] = useSearchParams();

  const [classArmId, setClassArmId] = useState(
    searchParams.get("classArmId") ?? "",
  );
  const [termId, setTermId] = useState("");
  const [approveTarget, setApproveTarget] = useState<ExamReviewSubject | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ExamReviewSubject | null>(null);

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

  const ready = Boolean(classArmId && effectiveTermId);
  const reviewQuery = useExamsReview(
    ready ? { classArmId, termId: effectiveTermId } : null,
  );
  const approveExam = useApproveExam();
  const rejectExam = useRejectExam();

  return (
    <div>
      <PageHeader
        title="Exam approvals"
        description="Review each subject's exam-submission status and approve or reject what's pending."
      />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exam-approvals-class">Class</Label>
            <select
              id="exam-approvals-class"
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
            <Label htmlFor="exam-approvals-term">Term</Label>
            <select
              id="exam-approvals-term"
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
          <Spinner /> Loading exam approvals…
        </div>
      )}

      {ready && reviewQuery.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">
              {getErrorMessage(reviewQuery.error, "Couldn't load exam approvals.")}
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
              No subjects have any exam scores entered for this class and term yet.
            </p>
          </CardContent>
        </Card>
      )}

      {ready && reviewQuery.data && reviewQuery.data.subjects.length > 0 && (
        <div className="flex flex-col gap-3">
          {reviewQuery.data.subjects.map((subject) => {
            const tier = examApprovalTier(subject);
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
                        {subject.draftCount} not yet submitted
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

                  {subject.pendingApprovalCount > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setApproveTarget(subject)}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-danger hover:bg-danger/10"
                        onClick={() => setRejectTarget(subject)}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={approveTarget !== null}
        onClose={() => setApproveTarget(null)}
        onConfirm={() => {
          if (!approveTarget) return;
          approveExam.mutate(
            { classArmId, subjectId: approveTarget.subjectId, termId: effectiveTermId },
            { onSuccess: () => setApproveTarget(null) },
          );
        }}
        title="Approve exam results"
        description={`This publishes ${approveTarget?.subjectName ?? "this subject"}'s exam results — students' exam scores and averages become final and visible on their report card.`}
        confirmLabel="Approve"
        isConfirming={approveExam.isPending}
      >
        {approveExam.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(approveExam.error)}
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => {
          if (!rejectTarget) return;
          rejectExam.mutate(
            { classArmId, subjectId: rejectTarget.subjectId, termId: effectiveTermId },
            { onSuccess: () => setRejectTarget(null) },
          );
        }}
        title="Reject exam results"
        description={`This returns ${rejectTarget?.subjectName ?? "this subject"}'s exam submission to draft — the teacher can revise scores and resubmit.`}
        confirmLabel="Reject"
        confirmTone="danger"
        isConfirming={rejectExam.isPending}
      >
        {rejectExam.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(rejectExam.error)}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
