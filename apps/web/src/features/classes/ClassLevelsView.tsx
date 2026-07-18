import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useClasses } from "./use-classes";
import { suggestNextArmName } from "./suggest-arm-name";
import { AddClassLevelDialog } from "./AddClassLevelDialog";
import { AddClassArmDialog } from "./AddClassArmDialog";

interface ClassLevelsViewProps {
  canManage: boolean;
}

export function ClassLevelsView({ canManage }: ClassLevelsViewProps) {
  const navigate = useNavigate();
  const classesQuery = useClasses();
  const [addLevelOpen, setAddLevelOpen] = useState(false);
  const [addArmForLevelId, setAddArmForLevelId] = useState<string | null>(null);

  const addArmLevel = useMemo(
    () => classesQuery.data?.find((level) => level.id === addArmForLevelId) ?? null,
    [classesQuery.data, addArmForLevelId],
  );
  const suggestedArmName = addArmLevel ? suggestNextArmName(addArmLevel.arms.map((arm) => arm.name)) : "";

  if (classesQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading classes…
      </div>
    );
  }

  if (classesQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
        <p className="text-sm text-danger">{getErrorMessage(classesQuery.error, "Couldn't load classes.")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => classesQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const levels = classesQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Classes"
        actions={
          canManage ? (
            <Button type="button" onClick={() => setAddLevelOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add level
            </Button>
          ) : undefined
        }
      />

      {levels.length === 0 ? (
        <div className="rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-muted">
            No class levels yet.{canManage && " Add the school's first level to get started."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {levels.map((level) => (
            <div key={level.id} className="rounded-lg border border-muted/20 bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-text">{level.name}</h2>
                {canManage && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setAddArmForLevelId(level.id)}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add arm
                  </Button>
                )}
              </div>

              {level.arms.length === 0 ? (
                <p className="text-sm text-muted">No arms yet for this level.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {level.arms.map((arm) => (
                    <button
                      key={arm.id}
                      type="button"
                      onClick={() => navigate(`/classes/arms/${arm.id}`)}
                      className="flex items-center gap-2 rounded-full border border-muted/30 bg-background px-3 py-1.5 text-sm hover:border-primary/50 hover:bg-primary/5"
                    >
                      <span className="font-medium text-text">
                        {level.name} {arm.name}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        {arm.enrollmentCount}
                      </span>
                      {arm.classTeacher ? (
                        <Avatar
                          firstName={arm.classTeacher.firstName}
                          lastName={arm.classTeacher.lastName}
                          className="h-5 w-5 text-[10px]"
                        />
                      ) : (
                        <span className="text-xs text-muted">No teacher</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <>
          <AddClassLevelDialog open={addLevelOpen} onClose={() => setAddLevelOpen(false)} />
          {addArmLevel && (
            <AddClassArmDialog
              classLevelId={addArmLevel.id}
              levelName={addArmLevel.name}
              suggestedName={suggestedArmName}
              open={addArmForLevelId !== null}
              onClose={() => setAddArmForLevelId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
