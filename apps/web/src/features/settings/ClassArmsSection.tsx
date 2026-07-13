import { useState } from "react";
import { Pencil } from "lucide-react";
import type { ClassArm, ClassLevel } from "@scholametric/shared";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { Button } from "../../components/ui/button";
import { useClassArmsList } from "./use-class-arms";
import { CreateClassArmDialog } from "./CreateClassArmDialog";
import { EditClassArmDialog } from "./EditClassArmDialog";

interface ClassArmsSectionProps {
  classLevel: ClassLevel | undefined;
}

export function ClassArmsSection({ classLevel }: ClassArmsSectionProps) {
  const [page, setPage] = useState(1);
  const classArms = useClassArmsList(classLevel?.id, page);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ClassArm | null>(null);

  function openEdit(event: React.MouseEvent, arm: ClassArm) {
    event.stopPropagation();
    setEditing(arm);
  }

  const columns: DataTableColumn<ClassArm>[] = [
    { key: "name", header: "Arm", cell: (row) => row.name },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <Button type="button" variant="outline" size="sm" onClick={(event) => openEdit(event, row)}>
          <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit
        </Button>
      ),
    },
  ];

  if (!classLevel) {
    return (
      <div className="rounded-lg border border-muted/20 bg-card p-6 text-center text-sm text-muted">
        Select a class level above to manage its arms.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text">Arms for {classLevel.name}</h2>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          New class arm
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={classArms.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={classArms.isLoading}
        isError={classArms.isError}
        onRetry={() => classArms.refetch()}
        emptyMessage="No arms yet for this class level."
        page={page}
        pageSize={classArms.data?.pageSize ?? 20}
        total={classArms.data?.total ?? 0}
        onPageChange={setPage}
        renderMobileCard={(row) => (
          <div className="flex items-center justify-between">
            <p className="font-medium text-text">{row.name}</p>
            <Button type="button" variant="outline" size="sm" onClick={(event) => openEdit(event, row)}>
              Edit
            </Button>
          </div>
        )}
      />

      <CreateClassArmDialog classLevelId={classLevel.id} open={createOpen} onClose={() => setCreateOpen(false)} />
      {editing && <EditClassArmDialog classArm={editing} open={editing !== null} onClose={() => setEditing(null)} />}
    </div>
  );
}
