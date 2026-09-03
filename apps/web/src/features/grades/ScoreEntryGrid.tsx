import { useRef } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useEvaluationScores } from "./use-evaluation-scores";
import { useExamScores } from "./use-exam-scores";
import { type EntryParams, isExamParams } from "./score-entry-track";
import {
  useScoreEntrySaveQueue,
  type CellState,
  type ScoreEntrySaveQueueTiming,
} from "./use-score-entry-save-queue";
import { ScoreEntryRow } from "./ScoreEntryRow";
import { TermLockBanner } from "./TermLockBanner";

const DEFAULT_CELL: CellState = {
  value: null,
  isAbsent: false,
  serverValue: null,
  serverIsAbsent: false,
  status: "idle",
};

// v0.7 step 1: native /100 scoring, no per-evaluation maxScore field on
// the response anymore (SPEC_V0.7.md §2/§5) — every evaluation shares the
// same fixed cap.
const MAX_SCORE = 100;

interface ScoreEntryGridProps {
  /** Discriminated by shape (evaluationId vs examId present) — see score-entry-track.ts. */
  params: EntryParams;
  /** SCHOOL_ADMIN/PROPRIETOR — shows Unlock/Relock on a closed term (SPEC_V0.5.md §2.3); hidden, not disabled, for anyone else. */
  canManageTermLock: boolean;
  /** Test-only: overrides the save queue's debounce/max-wait/retry timing. */
  saveQueueTiming?: ScoreEntrySaveQueueTiming;
  /**
   * v0.7.1 step 4 (SPEC_V0.7.1.md §4.3, item 11) — which evaluation/exam is
   * being graded + class/subject context, shown directly on the grid.
   * Purely a caller-supplied label: the name comes from the SAME already-
   * fetched evaluations/exams list the picker uses (same query key, no new
   * fetch) — this component itself still knows nothing about names.
   */
  heading?: { title: string; subtitle: string };
}

// The bulk score-entry grid (SPEC_V0.4.md §4 item 1) — one row per
// student, keyboard-first tab-through, save-as-you-go. No virtualization
// (see docs/DECISIONS.md): a flat list of ~100 single-input rows is well
// within what React handles natively, and virtualizing would break native
// Tab traversal across rows that aren't mounted.
//
// v0.7 step 3 (SPEC_V0.7.md §3): reused for BOTH tracks — evaluations and
// exams. Both read hooks are ALWAYS called (React's rules of hooks forbid
// calling one conditionally); only the one matching `params`'s shape is
// actually enabled, the other stays a permanently-disabled no-op query.
export function ScoreEntryGrid({
  params,
  canManageTermLock,
  saveQueueTiming,
  heading,
}: ScoreEntryGridProps) {
  const isExam = isExamParams(params);
  const evaluationQuery = useEvaluationScores(
    isExamParams(params) ? null : params,
  );
  const examQuery = useExamScores(isExamParams(params) ? params : null);
  const gridQuery = isExam ? examQuery : evaluationQuery;
  const queue = useScoreEntrySaveQueue(params, gridQuery.data, saveQueueTiming);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  function registerInput(studentId: string, el: HTMLInputElement | null) {
    if (el) inputRefs.current.set(studentId, el);
    else inputRefs.current.delete(studentId);
  }

  function handleNavigate(fromStudentId: string, direction: "next" | "prev") {
    const roster = gridQuery.data?.rows ?? [];
    const index = roster.findIndex((row) => row.studentId === fromStudentId);
    if (index === -1) return;
    const target = roster[direction === "next" ? index + 1 : index - 1];
    if (target) {
      inputRefs.current.get(target.studentId)?.focus();
    }
  }

  const roster = gridQuery.data?.rows ?? [];
  const enteredCount = roster.filter((row) => {
    const cell = queue.cells.get(row.studentId) ?? DEFAULT_CELL;
    return cell.value !== null || cell.isAbsent;
  }).length;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
        {heading && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Now grading
            </p>
            <p className="text-lg font-semibold text-text">
              {heading.title}{" "}
              <span className="text-sm font-normal text-muted">
                · {heading.subtitle}
              </span>
            </p>
          </div>
        )}

        {gridQuery.isLoading && (
          <div className="flex items-center gap-2 p-6 text-sm text-muted">
            <Spinner /> Loading grid…
          </div>
        )}

        {!gridQuery.isLoading && (gridQuery.isError || !gridQuery.data) && (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-danger">
              {getErrorMessage(gridQuery.error, "Couldn't load the grid.")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => gridQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        )}

        {gridQuery.data && roster.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm text-muted">
              No students enrolled in this class.
            </p>
          </div>
        )}

        {gridQuery.data && roster.length > 0 && (
          <>
            <TermLockBanner
              termId={params.termId}
              classArmId={params.classArmId}
              subjectId={params.subjectId}
              termClosed={gridQuery.data.termClosed}
              locked={gridQuery.data.locked}
              unlockReason={gridQuery.data.unlockReason}
              canManage={canManageTermLock}
            />

            {/* SPEC_V0.5.1.md §2.6 — grouped into its own bar, matching
                the roster list directly below it, instead of floating
                text, so the summary reads as a toolbar for the grid, not
                a stray line. */}
            <div className="flex items-center justify-between border-b border-muted/10 pb-3">
              <p className="text-sm text-text">
                <span className="font-medium">{enteredCount}</span>{" "}
                <span className="text-muted">
                  of {roster.length} entered · out of {MAX_SCORE}
                </span>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => gridQuery.refetch()}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Refresh
              </Button>
            </div>

            <div className="flex flex-col">
              {roster.map((row) => (
                <ScoreEntryRow
                  key={row.studentId}
                  student={row}
                  cellState={queue.cells.get(row.studentId) ?? DEFAULT_CELL}
                  maxScore={MAX_SCORE}
                  onEdit={queue.onCellEdit}
                  onToggleAbsent={queue.onToggleAbsent}
                  onNavigate={handleNavigate}
                  registerInput={registerInput}
                  termLocked={gridQuery.data.locked}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
