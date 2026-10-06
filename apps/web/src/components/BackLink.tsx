import { Link } from "react-router-dom";
import { cn } from "../lib/utils";

interface BackLinkProps {
  to: string;
  label: string;
  className?: string;
}

// v0.8.3 step 4 (SPEC_V0.8.3.md §2.7, Item 7) — the one shared back-to-
// parent affordance, reused across every drill-in page. An explicit
// <Link to>, not navigate(-1): a user who deep-linked or refreshed has no
// sensible browser history to go back to, and an explicit destination is
// predictable regardless of how the page was reached. `Button` has no
// polymorphic `asChild`, so this can't just reuse it — styled here to
// match its outline/sm classes exactly instead.
//
// Deliberately bakes in NO margin — same as `Button` itself, which bakes
// in none either. Every standalone call site applies its own `mb-4`;
// ReportCardPage's back link sits inside a flex row alongside its term
// selector and needs none, which is why this can't assume one.
export function BackLink({ to, label, className }: BackLinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-muted bg-card text-sm font-medium text-text transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary h-9 px-3",
        className,
      )}
    >
      {label}
    </Link>
  );
}
