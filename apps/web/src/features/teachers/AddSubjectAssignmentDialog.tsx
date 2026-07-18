import { useState, type FormEvent } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useClasses } from "./use-classes";
import { useSubjects } from "./use-subjects";
import { useCreateSubjectAssignment } from "./use-subject-assignments";

interface AddSubjectAssignmentDialogProps {
  teacherId: string;
  open: boolean;
  onClose: () => void;
}

interface ArmOutcome {
  armId: string;
  label: string;
  status: "success" | "error";
  message?: string;
}

// Subject -> arms multi-select -> one POST per selected arm. A slot already
// held by another teacher 409s with a message naming them (SPEC_V0.2.md
// §4) — shown inline per arm rather than as a single toast, since some
// arms in the same submission can succeed while others conflict.
export function AddSubjectAssignmentDialog({ teacherId, open, onClose }: AddSubjectAssignmentDialogProps) {
  const subjectsQuery = useSubjects();
  const classesQuery = useClasses();
  const createAssignment = useCreateSubjectAssignment();
  const [subjectId, setSubjectId] = useState("");
  const [selectedArmIds, setSelectedArmIds] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<ArmOutcome[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const arms = (classesQuery.data ?? []).flatMap((level) =>
    level.arms.map((arm) => ({ id: arm.id, label: `${level.name} ${arm.name}` })),
  );

  function handleClose() {
    setSubjectId("");
    setSelectedArmIds([]);
    setOutcomes(null);
    onClose();
  }

  function toggleArm(armId: string) {
    setSelectedArmIds((current) => (current.includes(armId) ? current.filter((id) => id !== armId) : [...current, armId]));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!subjectId || selectedArmIds.length === 0 || submitting) return;

    setSubmitting(true);
    const results: ArmOutcome[] = [];
    for (const armId of selectedArmIds) {
      const label = arms.find((arm) => arm.id === armId)?.label ?? armId;
      try {
        await createAssignment.mutateAsync({ subjectId, classArmId: armId, teacherUserId: teacherId });
        results.push({ armId, label, status: "success" });
      } catch (error) {
        results.push({ armId, label, status: "error", message: getErrorMessage(error) });
      }
    }
    setSubmitting(false);
    setOutcomes(results);

    if (results.every((result) => result.status === "success")) {
      handleClose();
      return;
    }
    // Leave only the conflicting arms selected so the admin can see exactly
    // what still needs attention if they retry.
    setSelectedArmIds(results.filter((result) => result.status === "error").map((result) => result.armId));
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Add subject" className="max-w-lg">
      <form className="flex flex-col gap-4 p-6" onSubmit={handleSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Add subject</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assignment-subject">Subject</Label>
          <Select
            id="assignment-subject"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
          >
            <option value="" disabled>
              Select a subject…
            </option>
            {(subjectsQuery.data ?? []).map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Classes</Label>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-muted/20 p-2">
            {arms.map((arm) => {
              const outcome = outcomes?.find((result) => result.armId === arm.id);
              return (
                <div key={arm.id} className="flex flex-col gap-1 rounded-md px-2 py-1.5 hover:bg-background">
                  <label className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={selectedArmIds.includes(arm.id)}
                      onChange={() => toggleArm(arm.id)}
                      className="h-4 w-4 rounded border-muted text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    {arm.label}
                    {outcome?.status === "success" && (
                      <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />
                    )}
                    {outcome?.status === "error" && <CircleX className="h-4 w-4 text-danger" aria-hidden="true" />}
                  </label>
                  {outcome?.status === "error" && (
                    <p role="alert" className="ml-6 text-xs text-danger">
                      {outcome.message}
                    </p>
                  )}
                </div>
              );
            })}
            {arms.length === 0 && !classesQuery.isLoading && (
              <p className="px-2 py-1.5 text-sm text-muted">No classes configured yet.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !subjectId || selectedArmIds.length === 0}>
            {submitting && <Spinner className="mr-2" />}
            Add
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
