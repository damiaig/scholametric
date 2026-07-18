import { useEffect, useState } from "react";
import type { SubjectWithLevels } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useClasses } from "./use-classes";
import { useSetSubjectLevels } from "./use-subjects";

interface SetSubjectLevelsDialogProps {
  subject: SubjectWithLevels;
  open: boolean;
  onClose: () => void;
}

export function SetSubjectLevelsDialog({ subject, open, onClose }: SetSubjectLevelsDialogProps) {
  const classesQuery = useClasses();
  const setLevels = useSetSubjectLevels();
  const [selectedLevelIds, setSelectedLevelIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setSelectedLevelIds(subject.classLevels.map((level) => level.id));
      setLevels.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject]);

  function toggleLevel(levelId: string) {
    setSelectedLevelIds((current) =>
      current.includes(levelId) ? current.filter((id) => id !== levelId) : [...current, levelId],
    );
  }

  function handleSubmit() {
    setLevels.mutate({ id: subject.id, classLevelIds: selectedLevelIds }, { onSuccess: onClose });
  }

  const levels = classesQuery.data ?? [];

  return (
    <Dialog open={open} onClose={onClose} title={`Levels for ${subject.name}`}>
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-text">Levels for {subject.name}</h2>
        <Label>Class levels this subject is offered at</Label>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-muted/20 p-2">
          {levels.map((level) => (
            <label key={level.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text hover:bg-background">
              <input
                type="checkbox"
                checked={selectedLevelIds.includes(level.id)}
                onChange={() => toggleLevel(level.id)}
                className="h-4 w-4 rounded border-muted text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {level.name}
            </label>
          ))}
          {levels.length === 0 && !classesQuery.isLoading && (
            <p className="px-2 py-1.5 text-sm text-muted">No class levels configured yet.</p>
          )}
        </div>
        {setLevels.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(setLevels.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={setLevels.isPending}>
            {setLevels.isPending && <Spinner className="mr-2" />}
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
