import { useState } from "react";
import type { AcademicSession } from "@scholametric/shared";
import { SessionsSection } from "./SessionsSection";
import { TermsSection } from "./TermsSection";

// v0.2 (SPEC_V0.2.md §4): class-level/arm management moved to /classes —
// this page is sessions & terms only now (was a two-sub-tab page in v0.1).
export function AcademicSettingsPage() {
  const [selectedSession, setSelectedSession] = useState<AcademicSession | undefined>(undefined);

  return (
    <div className="flex flex-col gap-8">
      <SessionsSection onSelectSession={setSelectedSession} />
      <TermsSection session={selectedSession} />
    </div>
  );
}
