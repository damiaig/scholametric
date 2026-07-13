import { useState } from "react";
import type { AcademicSession, ClassLevel } from "@scholametric/shared";
import { SessionsSection } from "./SessionsSection";
import { TermsSection } from "./TermsSection";
import { ClassLevelsSection } from "./ClassLevelsSection";
import { ClassArmsSection } from "./ClassArmsSection";

type SubTab = "sessions" | "classes";

export function AcademicSettingsPage() {
  const [subTab, setSubTab] = useState<SubTab>("sessions");
  const [selectedSession, setSelectedSession] = useState<AcademicSession | undefined>(undefined);
  const [selectedLevel, setSelectedLevel] = useState<ClassLevel | undefined>(undefined);

  return (
    <div className="flex flex-col gap-8">
      <div role="tablist" aria-label="Academic settings sections" className="flex gap-1 border-b border-muted/20">
        {(["sessions", "classes"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={subTab === key}
            onClick={() => setSubTab(key)}
            className={
              subTab === key
                ? "border-b-2 border-primary px-3 py-2 text-sm font-medium text-primary"
                : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted hover:text-text"
            }
          >
            {key === "sessions" ? "Sessions & terms" : "Class levels & arms"}
          </button>
        ))}
      </div>

      {subTab === "sessions" && (
        <>
          <SessionsSection onSelectSession={setSelectedSession} />
          <TermsSection session={selectedSession} />
        </>
      )}

      {subTab === "classes" && (
        <>
          <ClassLevelsSection onSelectLevel={setSelectedLevel} />
          <ClassArmsSection classLevel={selectedLevel} />
        </>
      )}
    </div>
  );
}
