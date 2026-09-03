import { Card, CardContent } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { StatusBadge } from "../../components/StatusBadge";
import type { RecentlyPostedItem } from "./use-recently-posted";

interface RecentlyPostedCardProps {
  items: RecentlyPostedItem[];
  isLoading: boolean;
  isError: boolean;
  hasTerm: boolean;
}

// v0.7.1 step 3 ruling: the badge reads "Subject published"/"Subject still
// draft", never just "Published"/"Draft" — an evaluation/exam has no
// publish state of its own (see use-recently-posted.ts), so a bare
// "Published" badge on one row would misleadingly imply that ITEM is
// published when in fact a straggler elsewhere in the subject could still
// be draft. This must be visible in the badge text itself, not a tooltip.
function subjectStatusBadge(status: RecentlyPostedItem["subjectStatus"]) {
  if (status === "PUBLISHED") {
    return <StatusBadge label="Subject published" tone="success" />;
  }
  if (status === "DRAFT") {
    return <StatusBadge label="Subject still draft" tone="warning" />;
  }
  return <StatusBadge label="Status unknown" tone="neutral" />;
}

export function RecentlyPostedCard({ items, isLoading, isError, hasTerm }: RecentlyPostedCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="mb-1 text-lg font-semibold text-text">Recently posted</h2>
        <p className="mb-4 text-sm text-muted">Your most recently created evaluations and exams.</p>

        {!hasTerm && <p className="text-sm text-muted">No current term yet.</p>}

        {hasTerm && isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted" role="status" aria-label="Loading recently posted">
            <Spinner /> Loading…
          </div>
        )}

        {hasTerm && !isLoading && isError && <p className="text-sm text-danger">Couldn&apos;t load recently posted items.</p>}

        {hasTerm && !isLoading && !isError && items.length === 0 && (
          <p className="text-sm text-muted">No evaluations or exams created yet.</p>
        )}

        {hasTerm && !isLoading && !isError && items.length > 0 && (
          <ul className="flex flex-col divide-y divide-muted/10">
            {items.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">{item.name}</p>
                  <p className="truncate text-sm text-muted">
                    {item.subjectName} · {item.className} · {item.type}
                  </p>
                </div>
                <div className="shrink-0">{subjectStatusBadge(item.subjectStatus)}</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
