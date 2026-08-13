import { useEffect, useState } from "react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useGradeBoundaries } from "../settings/use-grade-boundaries";
import { useOverrideGrade } from "./use-override-grade";
import type { OverrideTarget } from "./ClassArmResultsView";

interface OverrideGradeDialogProps {
  target: OverrideTarget | null;
  onClose: () => void;
}

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// SPEC_V0.4.md §4 item 3: "clearly marked as a manual override with the
// auto grade still shown." Grade options come from the school's own
// grading scale (GET /grade-boundaries), matching what the server
// actually validates against (GradesService.override()).
export function OverrideGradeDialog({ target, onClose }: OverrideGradeDialogProps) {
  const boundaries = useGradeBoundaries();
  const overrideGrade = useOverrideGrade();
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (target) {
      setSelected(target.overrideGrade ?? "");
    }
  }, [target]);

  function handleConfirm() {
    if (!target) return;
    overrideGrade.mutate(
      { termSubjectResultId: target.id, overrideGrade: selected === "" ? null : selected },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <Dialog open={target !== null} onClose={onClose} title="Override grade">
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-text">Override grade</h2>
          {target && (
            <p className="mt-1 text-sm text-muted">
              {target.studentName} — {target.subjectName}. This is a manual override; the auto-computed grade stays on
              record underneath it.
            </p>
          )}
        </div>

        {target && (
          <p className="text-sm text-text">
            Auto grade: <span className="font-mono font-medium">{target.autoGrade ?? "—"}</span>
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="override-grade-select">Override grade</Label>
          <select
            id="override-grade-select"
            className={SELECT_CLASS}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={boundaries.isLoading}
          >
            <option value="">No override (use auto grade)</option>
            {(boundaries.data ?? []).map((boundary) => (
              <option key={boundary.grade} value={boundary.grade}>
                {boundary.grade} — {boundary.remark}
              </option>
            ))}
          </select>
        </div>

        {overrideGrade.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(overrideGrade.error)}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={overrideGrade.isPending}>
            {overrideGrade.isPending && <Spinner className="mr-2" />}
            Save override
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
