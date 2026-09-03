import { useEffect, useState } from "react";
import { Card, CardContent } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { Tabs } from "../../components/ui/tabs";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { isProprietor } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyTeaching } from "../dashboard/use-my-teaching";
import { useClassArmDetail } from "../classes/use-class-arm-detail";
import { useAdminCurrentTerm } from "./use-admin-current-term";
import { EvaluationPicker } from "./EvaluationPicker";
import { ExamPicker } from "./ExamPicker";
import { useEvaluations } from "./use-evaluations";
import { useExams } from "./use-exams";
import { ScoreEntryGrid } from "./ScoreEntryGrid";
import { usePublishExamGrades } from "./use-publish-exam-grades";
import { useUnpublishExamGrades } from "./use-unpublish-exam-grades";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-56";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

interface EnterScoresTabProps {
  classArmId: string;
  subjectId: string;
  track: string;
  onTrackChange: (track: string) => void;
}

// SPEC_V0.7.1.md §3 (items 5, 6, 8) — one shared "Enter scores" tab for
// both tracks, carried over from the old ScoreEntryGridPage/ExamScoringPage
// (same class+subject-locked-context header, same term selector, same
// reused ScoreEntryGrid — see score-entry-track.ts for how the grid tells
// the two tracks apart). Evaluations and exams are presented as two
// clearly-labelled sub-tabs HERE, inside this one tab, not as two separate
// pages (item 8) — the closed-term/frozen-once-published messaging
// (TermLockBanner, picker "+ New" disabled state) carries over unchanged
// inside each track's picker.
export function EnterScoresTab({
  classArmId,
  subjectId,
  track,
  onTrackChange,
}: EnterScoresTabProps) {
  const { data: currentUser } = useCurrentUser();
  const isTeacher = currentUser?.role === "TEACHER";
  const isConfirmedAdmin =
    currentUser?.role === "SCHOOL_ADMIN" || currentUser?.role === "PROPRIETOR";

  const armDetail = useClassArmDetail(classArmId, 1, 1);
  const myTeaching = useMyTeaching();
  const adminTerm = useAdminCurrentTerm(isConfirmedAdmin);

  const [termId, setTermId] = useState("");
  const effectiveTermId = isTeacher
    ? (myTeaching.data?.currentTermId ?? "")
    : termId || adminTerm.currentTermId || "";

  const subjectLabel =
    armDetail.data?.subjectTeachers.find(
      (entry) => entry.subjectId === subjectId,
    )?.subjectName ?? "Subject";
  const armLabel = armDetail.data
    ? `${armDetail.data.classLevel.name} ${armDetail.data.name}`
    : "";

  if (armDetail.isLoading) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-muted">
        <Spinner /> Loading class…
      </div>
    );
  }

  if (armDetail.isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-danger">
            {getErrorMessage(armDetail.error, "Couldn't load this class.")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => armDetail.refetch()}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label>Class &amp; subject</Label>
            <p className="flex h-10 w-full items-center rounded-md border border-muted/30 bg-muted/5 px-3 text-sm font-medium text-text sm:w-56">
              {armLabel} · {subjectLabel}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enter-scores-term">Term</Label>
            {isTeacher ? (
              <p className="flex h-10 items-center text-sm text-text">
                {myTeaching.data?.currentTermName
                  ? formatTermName(myTeaching.data.currentTermName)
                  : "—"}
              </p>
            ) : (
              <select
                id="enter-scores-term"
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

      <p className="mb-4 text-sm text-muted">
        Evaluations feed the term average; exams are a separate track and never
        count toward it.
      </p>

      <Tabs
        value={track}
        onValueChange={onTrackChange}
        aria-label="Score entry track"
        items={[
          { value: "evaluations", label: "Evaluations" },
          { value: "exams", label: "Exams" },
        ]}
      >
        {!effectiveTermId ? (
          <Card>
            <CardContent className="p-10 text-center">
              <p className="text-sm text-muted">Choose a term to continue.</p>
            </CardContent>
          </Card>
        ) : track === "evaluations" ? (
          <EvaluationsTrack
            classArmId={classArmId}
            subjectId={subjectId}
            termId={effectiveTermId}
            armLabel={armLabel}
            subjectLabel={subjectLabel}
            isConfirmedAdmin={isConfirmedAdmin}
            isProprietorRole={isProprietor(currentUser?.role)}
          />
        ) : (
          <ExamsTrack
            classArmId={classArmId}
            subjectId={subjectId}
            termId={effectiveTermId}
            armLabel={armLabel}
            subjectLabel={subjectLabel}
            isConfirmedAdmin={isConfirmedAdmin}
            isProprietorRole={isProprietor(currentUser?.role)}
          />
        )}
      </Tabs>
    </div>
  );
}

interface EvaluationsTrackProps {
  classArmId: string;
  subjectId: string;
  termId: string;
  armLabel: string;
  subjectLabel: string;
  isConfirmedAdmin: boolean;
  isProprietorRole: boolean;
}

function EvaluationsTrack({
  classArmId,
  subjectId,
  termId,
  armLabel,
  subjectLabel,
  isConfirmedAdmin,
  isProprietorRole,
}: EvaluationsTrackProps) {
  const [evaluationId, setEvaluationId] = useState("");
  // v0.7.1 step 4 (item 11) — same queryKey EvaluationPicker's own
  // useEvaluations call already uses, so this is a cache hit, not a second
  // network request; only the selected evaluation's NAME is read here, to
  // label the grid heading below.
  const evaluationsQuery = useEvaluations({ classArmId, subjectId, termId });
  const selectedEvaluation = evaluationsQuery.data?.evaluations.find(
    (e) => e.id === evaluationId,
  );

  // Evaluations are scoped per term (SPEC_V0.7.md §3) — a selection from a
  // previous term is meaningless once the term changes underneath it.
  useEffect(() => {
    setEvaluationId("");
  }, [termId]);

  return (
    <div className="flex flex-col gap-4">
      <EvaluationPicker
        classArmId={classArmId}
        subjectId={subjectId}
        termId={termId}
        value={evaluationId}
        onChange={setEvaluationId}
        allowManage
        canManageTermLock={isConfirmedAdmin}
        canDelete={isProprietorRole}
      />

      {evaluationId ? (
        <ScoreEntryGrid
          params={{ classArmId, subjectId, evaluationId, termId }}
          canManageTermLock={isConfirmedAdmin}
          heading={
            selectedEvaluation
              ? {
                  title: selectedEvaluation.name,
                  subtitle: `${armLabel} · ${subjectLabel}`,
                }
              : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted">
              Choose an evaluation to load the grid.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ExamsTrackProps {
  classArmId: string;
  subjectId: string;
  termId: string;
  armLabel: string;
  subjectLabel: string;
  isConfirmedAdmin: boolean;
  isProprietorRole: boolean;
}

function ExamsTrack({
  classArmId,
  subjectId,
  termId,
  armLabel,
  subjectLabel,
  isConfirmedAdmin,
  isProprietorRole,
}: ExamsTrackProps) {
  const [examId, setExamId] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const publishExam = usePublishExamGrades();
  const unpublishExam = useUnpublishExamGrades();
  // v0.7.1 step 4 (item 11) — same queryKey ExamPicker's own useExams call
  // already uses (cache hit, no new fetch); only the selected exam's NAME
  // is read here, to label the grid heading below.
  const examsQuery = useExams({ classArmId, subjectId, termId });
  const selectedExam = examsQuery.data?.exams.find((e) => e.id === examId);

  // Exams are scoped per term (SPEC_V0.7.md §3) — same reasoning as evaluations.
  useEffect(() => {
    setExamId("");
  }, [termId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <ExamPicker
          classArmId={classArmId}
          subjectId={subjectId}
          termId={termId}
          value={examId}
          onChange={setExamId}
          allowManage
          canManageTermLock={isConfirmedAdmin}
          canDelete={isProprietorRole}
        />

        {/* v0.7.1 step 4 (item 12) — Publish made prominent (solid/primary,
            matching Review & Publish's evaluations-track button), not the
            easy-to-miss outline style this had before; Unpublish stays
            danger-outline, both hidden (not disabled) per role exactly as
            before. */}
        {isConfirmedAdmin && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setPublishOpen(true)}
            >
              Publish
            </Button>
            {isProprietorRole && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-danger hover:bg-danger/10"
                onClick={() => setUnpublishOpen(true)}
              >
                Unpublish
              </Button>
            )}
          </div>
        )}
      </div>

      {examId ? (
        <ScoreEntryGrid
          params={{ classArmId, subjectId, examId, termId }}
          canManageTermLock={isConfirmedAdmin}
          heading={
            selectedExam
              ? {
                  title: selectedExam.name,
                  subtitle: `${armLabel} · ${subjectLabel}`,
                }
              : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted">
              Choose an exam to load the grid.
            </p>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={() =>
          publishExam.mutate(
            { classArmId, subjectId, termId },
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
            { classArmId, subjectId, termId },
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
    </div>
  );
}
