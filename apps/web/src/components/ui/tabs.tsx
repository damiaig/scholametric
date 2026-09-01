import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

// SPEC_V0.7.1.md §3 (item 5) — the first genuine multi-panel tab case in
// this app; the three existing hand-rolled tablist patterns (ClassesPage,
// SettingsLayout, StudentDetailPage) are deliberately left as-is this step
// (no refactor of already-working pages). This primitive is used only by
// ClassGradesPage (the outer Enter-scores/Results tabs and the inner
// Evaluations/Exams track tabs).
interface TabItem {
  value: string;
  label: string;
}

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  items: TabItem[];
  "aria-label": string;
  children: ReactNode;
}

export function Tabs({ value, onValueChange, items, "aria-label": ariaLabel, children }: TabsProps) {
  return (
    <div>
      <div role="tablist" aria-label={ariaLabel} className="mb-4 flex gap-1 border-b border-muted/20">
        {items.map((item) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                selected ? "border-primary text-primary" : "border-transparent text-muted hover:text-text",
              )}
              onClick={() => onValueChange(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{children}</div>
    </div>
  );
}
