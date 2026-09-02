import type { MyProfile } from "@scholametric/shared";
import { cn } from "../../lib/utils";
import { Avatar } from "../../components/Avatar";

interface ChildSwitcherProps {
  children: MyProfile[];
  selectedChildId: string;
  onSelect: (childId: string) => void;
}

// SPEC_V0.7.1.md §2.4 (approved mockup) — each linked child as a tappable
// card, selected = accent border. `children` is whatever GET /me/children
// already returned (the v0.6 allow-list, display only) — this component
// never resolves or validates ids itself, it only renders the caller's
// own already-fetched list and reports which one was tapped.
export function ChildSwitcher({ children, selectedChildId, onSelect }: ChildSwitcherProps) {
  if (children.length === 0) return null;

  return (
    <div role="group" aria-label="Switch child" className="mb-6 flex flex-wrap gap-3">
      {children.map((child) => {
        const selected = child.studentId === selectedChildId;
        return (
          <button
            key={child.studentId}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(child.studentId)}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
              selected ? "border-accent bg-accent/5" : "border-muted/20 bg-card hover:border-muted/40",
            )}
          >
            <Avatar firstName={child.firstName} lastName={child.lastName} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">
                {child.firstName} {child.lastName}
              </p>
              {child.currentClassArmLabel && <p className="text-xs text-muted">{child.currentClassArmLabel}</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
