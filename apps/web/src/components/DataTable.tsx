import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, CircleAlert } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /**
   * Enables a clickable sort toggle on this column's header. This sorts only
   * the rows already on the current page — no list endpoint in this API
   * accepts a sort parameter, so a real cross-page sort isn't "cheap"; this
   * is. Leave unset for tables where a partial, page-local sort would be
   * more confusing than useful (e.g. a heavily paginated list).
   */
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  emptyMessage: string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Full control over the compact mobile layout — deliberately not auto-derived from columns. */
  renderMobileCard: (row: T) => ReactNode;
}

type SortDirection = "asc" | "desc";

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  emptyMessage,
  page,
  pageSize,
  total,
  onPageChange,
  renderMobileCard,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const getValue = column.sortValue;
    return [...rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av < bv) return sort.direction === "asc" ? -1 : 1;
      if (av > bv) return sort.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sort, columns]);

  function toggleSort(key: string) {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
        <CircleAlert className="h-8 w-8 text-danger" aria-hidden="true" />
        <p className="text-sm text-danger">{errorMessage ?? "Something went wrong loading this list."}</p>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return <DataTableSkeleton columns={columns} rowCount={Math.min(pageSize, 8)} />;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-muted/20 bg-card p-10 text-center">
        <p className="text-sm text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Desktop/tablet: real table. Breakpoint matches AppShell's sidebar collapse (md, 768px). */}
      <div className="hidden overflow-x-auto rounded-lg border border-muted/20 bg-card md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-muted/20">
              {columns.map((column) => (
                <th key={column.key} className={cn("px-4 py-3 font-medium text-muted", column.className)}>
                  {column.sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-text"
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.header}
                      {sort?.key === column.key ? (
                        sort.direction === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted/50" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-muted/10 last:border-0",
                  onRowClick && "cursor-pointer hover:bg-background",
                )}
              >
                {columns.map((column) => (
                  <td key={column.key} className={cn("px-4 py-3 text-text", column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards (CLAUDE.md §6: tables collapse to cards on mobile). */}
      <div className="flex flex-col gap-2 md:hidden">
        {sortedRows.map((row) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              "rounded-lg border border-muted/20 bg-card p-4",
              onRowClick && "cursor-pointer active:bg-background",
            )}
          >
            {renderMobileCard(row)}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          Page {page} of {totalPages} ({total} total)
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function DataTableSkeleton<T>({ columns, rowCount }: { columns: DataTableColumn<T>[]; rowCount: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-muted/20 bg-card" aria-label="Loading" role="status">
      {Array.from({ length: rowCount }).map((_, index) => (
        <div key={index} className="flex gap-4 border-b border-muted/10 px-4 py-3 last:border-0">
          {columns.map((column) => (
            <div key={column.key} className="h-4 flex-1 animate-pulse rounded bg-muted/10" />
          ))}
        </div>
      ))}
    </div>
  );
}
