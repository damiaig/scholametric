import { Info } from "lucide-react";

interface EmptySessionBannerProps {
  sessionName: string;
}

// SPEC_V0.2.md §4: shown on /students and /dashboard when the current
// session has zero enrollments — students may well exist, they just
// haven't been (re-)enrolled into the newly-activated session yet.
export function EmptySessionBanner({ sessionName }: EmptySessionBannerProps) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-text">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <p>
        No students are enrolled in the current session ({sessionName}) — students will not appear in lists until
        enrolled or promoted.
      </p>
    </div>
  );
}
