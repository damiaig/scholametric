import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ApiError, getErrorMessage } from "../../lib/api-client";
import { usePublishGrades } from "./use-publish-grades";
import { useAssessmentComponents } from "../settings/use-assessment-components";
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
  const components = useAssessmentComponents();

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
          <p className="font-medium text-danger">Some students still have a blank component — open the grid to resolve:</p>
          <ul className="list-inside list-disc">
            {groupByComponent(incompleteEntries).map(({ componentId, studentCount }) => (
              <li key={componentId}>
                {componentNameFor(components.data, componentId)}: {studentCount} student{studentCount === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </ConfirmDialog>
  );
}

function groupByComponent(entries: { studentId: string; componentId: string }[]): { componentId: string; studentCount: number }[] {
  const byComponent = new Map<string, Set<string>>();
  for (const entry of entries) {
    const students = byComponent.get(entry.componentId) ?? new Set<string>();
    students.add(entry.studentId);
    byComponent.set(entry.componentId, students);
  }
  return [...byComponent.entries()].map(([componentId, students]) => ({ componentId, studentCount: students.size }));
}

function componentNameFor(components: { id: string; name: string }[] | undefined, componentId: string): string {
  return components?.find((c) => c.id === componentId)?.name ?? "A component";
}
