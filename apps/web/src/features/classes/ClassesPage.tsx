import { useState } from "react";
import { isSchoolAdmin } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { ClassLevelsView } from "./ClassLevelsView";
import { SubjectsTab } from "./SubjectsTab";

type Tab = "classes" | "subjects";

// Subjects management lives as a tab within the Classes area (SPEC_V0.2.md
// §4), local-state sub-tab — same pattern as Settings → Academic's
// sessions/classes split in v0.1 (docs/DECISIONS.md).
export function ClassesPage() {
  const { data: currentUser } = useCurrentUser();
  const canManage = isSchoolAdmin(currentUser?.role);
  const [tab, setTab] = useState<Tab>("classes");

  return (
    <div>
      <div role="tablist" aria-label="Classes sections" className="mb-6 flex gap-1 border-b border-muted/20">
        {(["classes", "subjects"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={
              tab === key
                ? "border-b-2 border-primary px-3 py-2 text-sm font-medium text-primary"
                : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted hover:text-text"
            }
          >
            {key === "classes" ? "Classes" : "Subjects"}
          </button>
        ))}
      </div>

      {tab === "classes" && <ClassLevelsView canManage={canManage} />}
      {tab === "subjects" && <SubjectsTab canManage={canManage} />}
    </div>
  );
}
