import { Layers } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";

// SPEC_V0.2.md §7: Classes pages (level/arm browsing, subject management)
// are step 6 — this step only reserves the nav slot and route so the
// sidebar restructure is complete.
export function ClassesPlaceholderPage() {
  return (
    <div>
      <PageHeader title="Classes" />
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-muted/20 bg-card p-12 text-center">
        <Layers className="h-8 w-8 text-muted" aria-hidden="true" />
        <p className="text-sm text-muted">Classes management is coming in this version.</p>
      </div>
    </div>
  );
}
