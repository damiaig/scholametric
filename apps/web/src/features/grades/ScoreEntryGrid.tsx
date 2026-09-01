import { useRef } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useEvaluationScores } from "./use-evaluation-scores";
import { useExamScores } from "./use-exam-scores";
import { type EntryParams, isExamParams } from "./score-entry-track";
import { useScoreEntrySaveQueue, type CellState, type ScoreEntrySaveQueueTiming } from "./use-score-entry-save-queue";
import { ScoreEntryRow } from "./ScoreEntryRow";
import { TermLockBanner } from "./TermLockBanner";

const DEFAULT_CELL: CellState = { value: null, isAbsent: false, serverValue: null, serverIsAbsent: false, status: "idle" };

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
export function ScoreEntryGrid({ params, canManageTermLock, saveQueueTiming }: ScoreEntryGridProps) {
  const isExam = isExamParams(params);
  const evaluationQuery = useEvaluationScores(isExamParams(params) ? null : params);
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

  if (gridQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-muted">
        <Spinner /> Loading grid…
      </div>
    );
  }

  if (gridQuery.isError || !gridQuery.data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
        <p className="text-sm text-danger">{getErrorMessage(gridQuery.error, "Couldn't load the grid.")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => gridQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const roster = gridQuery.data.rows;

  if (roster.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-muted/20 bg-card p-10 text-center">
        <p className="text-sm text-muted">No students enrolled in this class.</p>
      </div>
    );
  }

  const enteredCount = roster.filter((row) => {
    const cell = queue.cells.get(row.studentId) ?? DEFAULT_CELL;
    return cell.value !== null || cell.isAbsent;
  }).length;

  return (
    <div className="flex flex-col gap-3">
      <TermLockBanner
        termId={params.termId}
        classArmId={params.classArmId}
        subjectId={params.subjectId}
        termClosed={gridQuery.data.termClosed}
        locked={gridQuery.data.locked}
        unlockReason={gridQuery.data.unlockReason}
        canManage={canManageTermLock}
      />

      {/* SPEC_V0.5.1.md §2.6 — grouped into its own bordered bar (matching
          the roster box directly below it) instead of floating text, so
          the summary reads as a toolbar for the grid, not a stray line. */}
      <div className="flex items-center justify-between rounded-lg border border-muted/20 bg-card px-4 py-2.5">
        <p className="text-sm text-text">
          <span className="font-medium">{enteredCount}</span> <span className="text-muted">of {roster.length} entered · out of {MAX_SCORE}</span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => gridQuery.refetch()}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-muted/20 bg-card">
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
    </div>
  );
}
