import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ApiError, getErrorMessage } from "../../lib/api-client";
import { usePublishGrades } from "./use-publish-grades";
import { useEvaluations } from "./use-evaluations";
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
  // Only fetched to LABEL a completeness-gate 409 below, not for the
  // happy path — canPublish already keeps that path from being clickable
  // in the common case (SPEC_V0.5.md §2.2/step 2), so this is a rare-race
  // fallback, not the primary defense.
  const evaluations = useEvaluations(subject ? { classArmId, subjectId: subject.subjectId, termId } : null);

  function handleConfirm() {
    if (!subject) return;
    publishGrades.mutate({ classArmId, subjectId: subject.subjectId, termId }, { onSuccess: () => onClose() });
  }

  const incompleteEntries =
    publishGrades.error instanceof ApiError && publishGrades.error.status === 409 ? publishGrades.error.body?.incompleteEntries : undefined;

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
      {publishGrades.isError && !incompleteEntries?.length && (
        <p role="alert" className="text-sm text-danger">
          {getErrorMessage(publishGrades.error)}
        </p>
      )}
      {incompleteEntries && incompleteEntries.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-text">
          <p className="font-medium text-danger">Some students still have a blank evaluation — open the grid to resolve:</p>
          <ul className="list-inside list-disc">
            {groupByEvaluation(incompleteEntries).map(({ evaluationId, studentCount }) => (
              <li key={evaluationId}>
                {evaluationNameFor(evaluations.data?.evaluations, evaluationId)}: {studentCount} student{studentCount === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </ConfirmDialog>
  );
}

function groupByEvaluation(entries: { studentId: string; evaluationId: string }[]): { evaluationId: string; studentCount: number }[] {
  const byEvaluation = new Map<string, Set<string>>();
  for (const entry of entries) {
    const students = byEvaluation.get(entry.evaluationId) ?? new Set<string>();
    students.add(entry.studentId);
    byEvaluation.set(entry.evaluationId, students);
  }
  return [...byEvaluation.entries()].map(([evaluationId, students]) => ({ evaluationId, studentCount: students.size }));
}

function evaluationNameFor(evaluations: { id: string; name: string }[] | undefined, evaluationId: string): string {
  return evaluations?.find((e) => e.id === evaluationId)?.name ?? "An evaluation";
}
