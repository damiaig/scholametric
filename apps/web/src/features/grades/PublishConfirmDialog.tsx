import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { usePublishGrades } from "./use-publish-grades";
import type { GradesReviewSubject } from "@scholametric/shared";

interface PublishConfirmDialogProps {
  classArmName: string;
  termLabel: string;
  subject: GradesReviewSubject | null;
  classArmId: string;
  termId: string;
  onClose: () => void;
}

// SPEC_V0.4.md §4 item 3's exact confirmation text pattern: "This
// publishes {class} {subject} {term} results — students' grades and
// positions become final."
export function PublishConfirmDialog({ classArmName, termLabel, subject, classArmId, termId, onClose }: PublishConfirmDialogProps) {
  const publishGrades = usePublishGrades();

  function handleConfirm() {
    if (!subject) return;
    publishGrades.mutate({ classArmId, subjectId: subject.subjectId, termId }, { onSuccess: () => onClose() });
  }

  return (
    <ConfirmDialog
      open={subject !== null}
      onClose={onClose}
      onConfirm={handleConfirm}
      title="Publish results"
      description={
        subject
          ? `This publishes ${classArmName} ${subject.subjectName} ${termLabel} results — students' grades and positions become final.`
          : undefined
      }
      confirmLabel="Publish"
      isConfirming={publishGrades.isPending}
    >
      {publishGrades.isError && (
        <p role="alert" className="text-sm text-danger">
          {getErrorMessage(publishGrades.error)}
        </p>
      )}
    </ConfirmDialog>
  );
}
