import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "./card";
import { cn } from "../../lib/utils";

const TONE_CLASSES = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  accent: "bg-accent/10 text-accent",
} as const;

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: keyof typeof TONE_CLASSES;
}

// SPEC_V0.7.1.md §3 (item 5's Tabs precedent, same rule here) — the same
// icon-circle/label/value card was already hand-copied twice
// (AdminDashboard, MyClassesView, both left as-is per the "don't refactor
// working pages" rule); this is the shared primitive for every NEW stat
// tile going forward, starting with the student/parent dashboards.
export function StatCard({ icon: Icon, label, value, tone = "primary" }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", TONE_CLASSES[tone])}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p className="text-2xl font-semibold text-text">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
