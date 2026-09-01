import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Label } from "../../components/ui/label";
import { Spinner } from "../../components/ui/spinner";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { isProprietor } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyTeaching } from "../dashboard/use-my-teaching";
import { useClassArmDetail } from "../classes/use-class-arm-detail";
import { useAdminCurrentTerm } from "./use-admin-current-term";
import { ExamPicker } from "./ExamPicker";
import { ScoreEntryGrid } from "./ScoreEntryGrid";
import { usePublishExamGrades } from "./use-publish-exam-grades";
import { useUnpublishExamGrades } from "./use-unpublish-exam-grades";

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-56";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

// v0.7 step 3 (SPEC_V0.7.md §3) — Track B's scoring page, mirroring
// ScoreEntryGridPage exactly (same class+subject-locked-context pattern,
// same term/entry-picker order, same reused ScoreEntryGrid — see
// score-entry-track.ts for how the grid tells the two tracks apart).
// Adds one thing evaluations don't need here: a minimal Publish/Unpublish
// action right on this page (confirmed: no dedicated Exams Review &
// Publish surface this step — that's a second review page, out of scope).
export function ExamScoringPage() {
  const { data: currentUser } = useCurrentUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTeacher = currentUser?.role === "TEACHER";
  const isConfirmedAdmin = currentUser?.role === "SCHOOL_ADMIN" || currentUser?.role === "PROPRIETOR";

  const classArmId = searchParams.get("classArmId") ?? "";
  const subjectId = searchParams.get("subjectId") ?? "";
  const [examId, setExamId] = useState("");
  const [termId, setTermId] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);

  const hasLockedParams = Boolean(classArmId && subjectId);

  useEffect(() => {
    if (!hasLockedParams && currentUser) {
      navigate(currentUser.role === "TEACHER" ? "/dashboard" : "/classes", { replace: true });
    }
  }, [hasLockedParams, currentUser, navigate]);

  const armDetail = useClassArmDetail(hasLockedParams ? classArmId : undefined, 1, 1);
  const myTeaching = useMyTeaching();
  const adminTerm = useAdminCurrentTerm(isConfirmedAdmin);
  const publishExam = usePublishExamGrades();
  const unpublishExam = useUnpublishExamGrades();

  const effectiveTermId = isTeacher ? (myTeaching.data?.currentTermId ?? "") : termId || adminTerm.currentTermId || "";
  const ready = Boolean(examId && effectiveTermId && armDetail.data);

  // Exams are scoped per term (SPEC_V0.7.md §3) — a selection from a
  // previous term is meaningless once the term changes underneath it.
  useEffect(() => {
    setExamId("");
  }, [effectiveTermId]);

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
      <PageHeader title="Enter exam scores" description="Pick a term and exam to load the entry grid." />

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
              <p className="flex h-10 w-full items-center rounded-md border border-muted/30 bg-muted/5 px-3 text-sm font-medium text-text sm:w-56">
                {armLabel} · {subjectLabel}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exam-grid-term">Term</Label>
              {isTeacher ? (
                <p className="flex h-10 items-center text-sm text-text">
                  {myTeaching.data?.currentTermName ? formatTermName(myTeaching.data.currentTermName) : "—"}
                </p>
              ) : (
                <select
                  id="exam-grid-term"
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

            {effectiveTermId && (
              <ExamPicker
                id="exam-grid-exam"
                classArmId={classArmId}
                subjectId={subjectId}
                termId={effectiveTermId}
                value={examId}
                onChange={setExamId}
                allowManage
                canManageTermLock={isConfirmedAdmin}
                canDelete={isProprietor(currentUser?.role)}
              />
            )}

            {isConfirmedAdmin && effectiveTermId && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPublishOpen(true)}>
                  Publish
                </Button>
                {isProprietor(currentUser?.role) && (
                  <Button type="button" variant="outline" size="sm" className="text-danger hover:bg-danger/10" onClick={() => setUnpublishOpen(true)}>
                    Unpublish
                  </Button>
                )}
              </div>
            )}
          </div>

          {ready ? (
            <ScoreEntryGrid
              params={{ classArmId, subjectId, examId, termId: effectiveTermId }}
              canManageTermLock={isConfirmedAdmin}
            />
          ) : (
            <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
              Choose a term and exam to load the grid.
            </p>
          )}

          <ConfirmDialog
            open={publishOpen}
            onClose={() => setPublishOpen(false)}
            onConfirm={() =>
              publishExam.mutate(
                { classArmId, subjectId, termId: effectiveTermId },
                { onSuccess: () => setPublishOpen(false) },
              )
            }
            title="Publish exam results"
            description={`This publishes ${armLabel} ${subjectLabel} exam results for this term — students' exam scores and averages become final and visible on their report card.`}
            confirmLabel="Publish"
            isConfirming={publishExam.isPending}
          >
            {publishExam.isError && (
              <p role="alert" className="text-sm text-danger">
                {getErrorMessage(publishExam.error)}
              </p>
            )}
          </ConfirmDialog>

          <ConfirmDialog
            open={unpublishOpen}
            onClose={() => setUnpublishOpen(false)}
            onConfirm={() =>
              unpublishExam.mutate(
                { classArmId, subjectId, termId: effectiveTermId },
                { onSuccess: () => setUnpublishOpen(false) },
              )
            }
            title="Unpublish exam results"
            description={`This reverts ${armLabel} ${subjectLabel} exam results to draft — students and parents will no longer see them until published again.`}
            confirmLabel="Unpublish"
            confirmTone="danger"
            isConfirming={unpublishExam.isPending}
          >
            {unpublishExam.isError && (
              <p role="alert" className="text-sm text-danger">
                {getErrorMessage(unpublishExam.error)}
              </p>
            )}
          </ConfirmDialog>
        </>
      )}
    </div>
  );
}
