import { useEffect, useState } from "react";
import { validateGridScore } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Checkbox } from "../../components/ui/checkbox";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { EvaluationPicker } from "./EvaluationPicker";
import { useEvaluationScores } from "./use-evaluation-scores";
import { useCorrectPublishedScore } from "./use-correct-published-score";
import type { MarkAbsentTarget } from "./ClassArmResultsView";

interface MarkAbsentDialogProps {
  target: MarkAbsentTarget | null;
  onClose: () => void;
}

// SPEC_V0.5.1.md §2.5, v0.5.1 step 4: corrects one evaluation's absence/
// score on an already-PUBLISHED result — the real case is "a teacher
// entered a score, but the student was actually absent" (or the reverse),
// discovered after publishing. This view only shows the subject TOTAL, not
// a per-evaluation breakdown, so an evaluation is picked here first; once
// picked, GET /grades/evaluation-scores (the same query the entry grid
// itself uses) shows this student's CURRENT value for that exact cell to
// correct from. allowManage is false here — this is a browse-only picker
// (correcting an existing evaluation's score), not the authoring surface.
export function MarkAbsentDialog({ target, onClose }: MarkAbsentDialogProps) {
  const [evaluationId, setEvaluationId] = useState("");
  const [isAbsent, setIsAbsent] = useState(false);
  const [scoreText, setScoreText] = useState("");

  const gridQuery = useEvaluationScores(
    target && evaluationId ? { classArmId: target.classArmId, subjectId: target.subjectId, evaluationId, termId: target.termId } : null,
  );
  const currentRow = gridQuery.data?.rows.find((r) => r.studentId === target?.studentId);

  const correctScore = useCorrectPublishedScore();

  useEffect(() => {
    if (target) {
      setEvaluationId("");
      setIsAbsent(false);
      setScoreText("");
    }
  }, [target]);

  // Once the current row for the chosen component loads, prefill the form
  // from its actual state — an admin correcting a mistake needs to see
  // what's on record now, not start from a blank slate.
  useEffect(() => {
    if (currentRow) {
      setIsAbsent(currentRow.isAbsent);
      setScoreText(currentRow.rawScore === null ? "" : String(currentRow.rawScore));
    }
  }, [currentRow]);

  // v0.7 step 1: native /100 scoring, no per-evaluation maxScore anymore.
  const scoreValidation =
    isAbsent || scoreText.trim() === "" || gridQuery.data === undefined ? { isValid: true } : validateGridScore(Number(scoreText), 100);
  const canSubmit = evaluationId !== "" && (isAbsent || (scoreText.trim() !== "" && scoreValidation.isValid));

  function handleSubmit() {
    if (!target || !canSubmit) return;
    correctScore.mutate(
      {
        classArmId: target.classArmId,
        subjectId: target.subjectId,
        evaluationId,
        termId: target.termId,
        studentId: target.studentId,
        rawScore: isAbsent ? null : Number(scoreText),
        isAbsent,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <Dialog open={target !== null} onClose={onClose} title="Correct a published result">
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-text">Correct a published result</h2>
          {target && (
            <p className="mt-1 text-sm text-muted">
              {target.studentName} — {target.subjectName}. This result is already published; correcting it recomputes the
              total and re-ranks the class, and stays published.
            </p>
          )}
        </div>

        {target && (
          <EvaluationPicker
            id="mark-absent-evaluation"
            classArmId={target.classArmId}
            subjectId={target.subjectId}
            termId={target.termId}
            value={evaluationId}
            onChange={setEvaluationId}
          />
        )}

        {evaluationId && gridQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Loading current value…
          </div>
        )}

        {evaluationId && gridQuery.isError && (
          <p className="text-sm text-danger">{getErrorMessage(gridQuery.error, "Couldn't load the current value.")}</p>
        )}

        {evaluationId && gridQuery.data && (
          <>
            <div className="flex items-center gap-2">
              <Checkbox id="mark-absent-checkbox" checked={isAbsent} onChange={(event) => setIsAbsent(event.target.checked)} />
              <Label htmlFor="mark-absent-checkbox">Mark absent</Label>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mark-absent-score">Score (out of 100)</Label>
              <Input
                id="mark-absent-score"
                type="text"
                inputMode="decimal"
                value={scoreText}
                disabled={isAbsent}
                onChange={(event) => setScoreText(event.target.value)}
              />
              {!isAbsent && scoreText.trim() !== "" && !scoreValidation.isValid && (
                <p className="text-sm text-danger">{scoreValidation.error}</p>
              )}
            </div>
          </>
        )}

        {correctScore.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(correctScore.error)}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit || correctScore.isPending}>
            {correctScore.isPending && <Spinner className="mr-2" />}
            Save correction
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
