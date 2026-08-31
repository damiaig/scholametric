import { useState } from "react";
import type { AcademicSession } from "@scholametric/shared";
import { isSchoolAdmin } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { SessionsSection } from "./SessionsSection";
import { TermsSection } from "./TermsSection";
import { GradingScalePanel } from "./GradingScalePanel";

// v0.2 (SPEC_V0.2.md §4): class-level/arm management moved to /classes —
// this page is sessions & terms only now (was a two-sub-tab page in v0.1).
// v0.3 (SPEC_V0.3.md §4 item 3): grading scale panel added, admin-only
// (PROPRIETOR/SCHOOL_ADMIN) — absent for TEACHER, same "absent not
// disabled" convention as the rest of the app's role-gated UI (Sidebar.tsx,
// RequireSchoolAdmin.tsx). v0.7 step 2: the assessment structure panel
// that used to sit alongside it is removed — assessment_components was
// dropped in the v0.7 cutover (docs/DECISIONS.md), replaced by
// per-subject/per-term evaluations authored from the Score Entry page.
export function AcademicSettingsPage() {
  const [selectedSession, setSelectedSession] = useState<AcademicSession | undefined>(undefined);
  const { data: currentUser } = useCurrentUser();
  const canManageGrading = isSchoolAdmin(currentUser?.role);

  return (
    <div className="flex flex-col gap-8">
      <SessionsSection onSelectSession={setSelectedSession} />
      <TermsSection session={selectedSession} />
      {canManageGrading && <GradingScalePanel />}
    </div>
  );
}
