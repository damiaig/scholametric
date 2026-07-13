import { cn } from "../lib/utils";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_STYLES: Record<BadgeTone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-primary/10 text-primary",
  neutral: "bg-muted/10 text-muted",
};

interface StatusBadgeProps {
  label: string;
  tone: BadgeTone;
  className?: string;
}

// Domain-agnostic on purpose (SPEC_V0.1.md §4: "built once, reused forever")
// — callers map their own status enum to a tone via a small local helper
// (e.g. studentStatusTone), so this component never needs to know about
// students, schools, or anything else.
export function StatusBadge({ label, tone, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_STYLES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
