import { Link } from "react-router-dom";
import { Card, CardContent } from "../../components/ui/card";
import { formatScore } from "../grades/format-score";
import { ClassAverageLabel } from "../grades/ClassStats";
import type { GradeRow } from "./recent-grades";

const MAX_ROWS = 5;

interface GradesBySubjectCardProps {
  rows: GradeRow[];
  gradesHref: string;
}

// SPEC_V0.7.1.md §3 (item 2.1/4.9) — "Your grades": your most recent
// evaluation/exam per subject, capped at MAX_ROWS. Deliberately NOT titled
// "Recent grades" — see recent-grades.ts's doc comment for why a true
// recency label would be inaccurate given the data available this step.
export function GradesBySubjectCard({ rows, gradesHref }: GradesBySubjectCardProps) {
  const visible = rows.slice(0, MAX_ROWS);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-text">Your grades</h2>
          <Link to={gradesHref} className="text-sm text-primary hover:underline">
            View all →
          </Link>
        </div>
        <p className="mb-4 text-xs text-muted">Your most recent evaluation or exam in each subject.</p>

        {visible.length === 0 ? (
          <p className="text-sm text-muted">No grades published yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-3 border-b border-muted/10 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{row.name}</p>
                  <p className="text-xs text-muted">
                    {row.subjectName} · {row.type}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm text-text">{row.isAbsent ? "Abs" : row.rawScore === null ? "—" : formatScore(row.rawScore)}</p>
                  <ClassAverageLabel value={row.classAverageScore} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
