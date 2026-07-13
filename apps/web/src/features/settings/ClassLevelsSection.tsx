import { useState } from "react";
import { Pencil } from "lucide-react";
import type { ClassLevel } from "@scholametric/shared";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { Button } from "../../components/ui/button";
import { useClassLevelsList } from "./use-class-levels";
import { CreateClassLevelDialog } from "./CreateClassLevelDialog";
import { EditClassLevelDialog } from "./EditClassLevelDialog";

interface ClassLevelsSectionProps {
  onSelectLevel: (level: ClassLevel) => void;
}

export function ClassLevelsSection({ onSelectLevel }: ClassLevelsSectionProps) {
  const [page, setPage] = useState(1);
  const classLevels = useClassLevelsList(page);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ClassLevel | null>(null);

  function openEdit(event: React.MouseEvent, level: ClassLevel) {
    event.stopPropagation();
    setEditing(level);
  }

  const columns: DataTableColumn<ClassLevel>[] = [
    { key: "name", header: "Class level", cell: (row) => row.name },
    { key: "rank", header: "Rank", cell: (row) => row.rank, className: "font-mono" },
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text">Class levels</h2>
          <p className="text-sm text-muted">Click a level to manage its arms below.</p>
        </div>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          New class level
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={classLevels.data?.items ?? []}
        rowKey={(row) => row.id}
        onRowClick={onSelectLevel}
        isLoading={classLevels.isLoading}
        isError={classLevels.isError}
        onRetry={() => classLevels.refetch()}
        emptyMessage="No class levels yet. Create the school's first class level to get started."
        page={page}
        pageSize={classLevels.data?.pageSize ?? 20}
        total={classLevels.data?.total ?? 0}
        onPageChange={setPage}
        renderMobileCard={(row) => (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text">{row.name}</p>
              <p className="font-mono text-sm text-muted">Rank {row.rank}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={(event) => openEdit(event, row)}>
              Edit
            </Button>
          </div>
        )}
      />

      <CreateClassLevelDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {editing && <EditClassLevelDialog classLevel={editing} open={editing !== null} onClose={() => setEditing(null)} />}
    </div>
  );
}
