import { useState, type MouseEvent } from "react";
import { Plus, Pencil, Layers, Trash2 } from "lucide-react";
import type { SubjectWithLevels } from "@scholametric/shared";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { useSubjectsList, useDeleteSubject } from "./use-subjects";
import { CreateSubjectDialog } from "./CreateSubjectDialog";
import { EditSubjectDialog } from "./EditSubjectDialog";
import { SetSubjectLevelsDialog } from "./SetSubjectLevelsDialog";

const PAGE_SIZE = 20;

interface SubjectsTabProps {
  canManage: boolean;
}

export function SubjectsTab({ canManage }: SubjectsTabProps) {
  const [page, setPage] = useState(1);
  const subjectsQuery = useSubjectsList(page, PAGE_SIZE);
  const deleteSubject = useDeleteSubject();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectWithLevels | null>(null);
  const [editingLevels, setEditingLevels] = useState<SubjectWithLevels | null>(null);
  const [deleting, setDeleting] = useState<SubjectWithLevels | null>(null);

  function openEdit(event: MouseEvent, subject: SubjectWithLevels) {
    event.stopPropagation();
    setEditing(subject);
  }
  function openLevels(event: MouseEvent, subject: SubjectWithLevels) {
    event.stopPropagation();
    setEditingLevels(subject);
  }
  function openDelete(event: MouseEvent, subject: SubjectWithLevels) {
    event.stopPropagation();
    deleteSubject.reset();
    setDeleting(subject);
  }

  const columns: DataTableColumn<SubjectWithLevels>[] = [
    { key: "name", header: "Name", sortable: true, sortValue: (row) => row.name.toLowerCase(), cell: (row) => row.name },
    { key: "code", header: "Code", className: "font-mono", cell: (row) => row.code ?? "—" },
    {
      key: "levels",
      header: "Levels",
      cell: (row) =>
        row.classLevels.length === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.classLevels.map((level) => (
              <StatusBadge key={level.id} label={level.name} tone="info" />
            ))}
          </div>
        ),
    },
    {
      key: "actions",
      header: "",
      cell: (row) =>
        canManage ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" aria-label={`Edit ${row.name}`} onClick={(e) => openEdit(e, row)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Edit levels for ${row.name}`}
              onClick={(e) => openLevels(e, row)}
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Delete ${row.name}`}
              className="text-danger hover:bg-danger/10"
              onClick={(e) => openDelete(e, row)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        {canManage && (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New subject
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={subjectsQuery.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={subjectsQuery.isLoading}
        isError={subjectsQuery.isError}
        errorMessage={getErrorMessage(subjectsQuery.error, "Couldn't load subjects.")}
        onRetry={() => subjectsQuery.refetch()}
        emptyMessage="No subjects yet."
        page={page}
        pageSize={PAGE_SIZE}
        total={subjectsQuery.data?.total ?? 0}
        onPageChange={setPage}
        renderMobileCard={(row) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="font-medium text-text">{row.name}</p>
              <span className="font-mono text-xs text-muted">{row.code ?? "—"}</span>
            </div>
            {row.classLevels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {row.classLevels.map((level) => (
                  <StatusBadge key={level.id} label={level.name} tone="info" />
                ))}
              </div>
            )}
            {canManage && (
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={(e) => openEdit(e, row)}>
                  Edit
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={(e) => openLevels(e, row)}>
                  Levels
                </Button>
                <Button type="button" variant="outline" size="sm" className="text-danger" onClick={(e) => openDelete(e, row)}>
                  Delete
                </Button>
              </div>
            )}
          </div>
        )}
      />

      {canManage && (
        <>
          <CreateSubjectDialog open={createOpen} onClose={() => setCreateOpen(false)} />
          {editing && <EditSubjectDialog subject={editing} open={editing !== null} onClose={() => setEditing(null)} />}
          {editingLevels && (
            <SetSubjectLevelsDialog
              subject={editingLevels}
              open={editingLevels !== null}
              onClose={() => setEditingLevels(null)}
            />
          )}
          <ConfirmDialog
            open={deleting !== null}
            onClose={() => setDeleting(null)}
            onConfirm={() => {
              if (!deleting) return;
              deleteSubject.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
            }}
            title="Delete subject"
            description={`This permanently removes "${deleting?.name}" from the subject list.`}
            confirmLabel="Delete"
            confirmTone="danger"
            isConfirming={deleteSubject.isPending}
          >
            {deleteSubject.isError && (
              <p role="alert" className="text-sm text-danger">
                {getErrorMessage(deleteSubject.error)}
              </p>
            )}
          </ConfirmDialog>
        </>
      )}
    </div>
  );
}
