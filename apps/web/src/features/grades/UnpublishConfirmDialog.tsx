import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { useUnpublishGrades } from "./use-unpublish-grades";
import type { GradesReviewSubject } from "@scholametric/shared";

interface UnpublishConfirmDialogProps {
  classArmName: string;
  subject: GradesReviewSubject | null;
  classArmId: string;
  termId: string;
  onClose: () => void;
}

// Owner-only, danger tone, no typed-confirmation — but the description
// MUST name the blast radius: unpublish doesn't just revert this one
// subject, it re-triggers the whole class arm's overall-position recompute
// (Step 3's cascade, GradesService.recomputeOverallForClassArm), so a
// proprietor isn't surprised other students' standings moved too.
export function UnpublishConfirmDialog({ classArmName, subject, classArmId, termId, onClose }: UnpublishConfirmDialogProps) {
  const unpublishGrades = useUnpublishGrades();

  function handleConfirm() {
    if (!subject) return;
    unpublishGrades.mutate({ classArmId, subjectId: subject.subjectId, termId }, { onSuccess: () => onClose() });
  }

  return (
    <ConfirmDialog
      open={subject !== null}
      onClose={onClose}
      onConfirm={handleConfirm}
      title="Unpublish results"
      description={
        subject
          ? `This reverts ${classArmName} ${subject.subjectName} to pending approval and recomputes overall positions for the whole class — other students' overall standings may shift, not just this subject.`
          : undefined
      }
      confirmLabel="Unpublish"
      confirmTone="danger"
      isConfirming={unpublishGrades.isPending}
    >
      {unpublishGrades.isError && (
        <p role="alert" className="text-sm text-danger">
          {getErrorMessage(unpublishGrades.error)}
        </p>
      )}
    </ConfirmDialog>
  );
}
