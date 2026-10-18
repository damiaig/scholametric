import { Link } from "react-router-dom";
import type { StudentHomeworkEntry } from "@scholametric/shared";
import { Card, CardContent } from "../../components/ui/card";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDueDateRelative } from "../../lib/format-date";

const MAX_ROWS = 3;

interface HomeworkPreviewCardProps {
  homework: StudentHomeworkEntry[];
  homeworkHref: string;
}

// v0.8.3 UX Round 2 Step D — the fetch-backed richer version of the
// dashboard homework card Step B deliberately deferred ("plain link now,
// preview later"). Mirrors GradesBySubjectCard's own structure exactly
// (header + "View all →" + tagline + bordered rows + empty state, MAX_ROWS
// sliced inside the component, rows are plain <li>s, not links). The data
// itself needs no filtering/sorting here — GET /me/homework already
// returns only PUBLISHED, not-yet-past-due homework, ordered by dueDate
// ascending (listPublishedForStudent), so "next few upcoming, nearest due
// first" is just this response's own first 3 rows.
export function HomeworkPreviewCard({ homework, homeworkHref }: HomeworkPreviewCardProps) {
  const visible = homework.slice(0, MAX_ROWS);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-text">Your homework</h2>
          <Link to={homeworkHref} className="text-sm text-primary hover:underline">
            View all →
          </Link>
        </div>
        <p className="mb-4 text-xs text-muted">Your next few homework items.</p>

        {visible.length === 0 ? (
          <p className="text-sm text-muted">No homework due right now.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 border-b border-muted/10 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{item.title}</p>
                  <p className="text-xs text-muted">
                    {item.subjectName} · Due {formatDueDateRelative(item.dueDate)}
                  </p>
                </div>
                <StatusBadge label={item.markedDone ? "Done" : "Not done"} tone={item.markedDone ? "success" : "neutral"} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
