import { useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { ReportCardDocument } from "../grades/ReportCardDocument";
import { useMyReportCard } from "../grades/use-my-report-card";
import { useMyProfile } from "./use-my-profile";
import { useMyTerms } from "./use-my-terms";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-64";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

// v0.6 step 3 (SPEC_V0.6.md §2.3): a STUDENT's own read view — their
// published grades + report card, reusing the SAME ReportCardDocument
// renderer the staff-facing ReportCardPage uses (v0.5 step 4), with the
// remark forms always off (read-only, self-view). PARENT still gets the
// v0.6 step 2 placeholder below — their read view is step 4.
function StudentPortalHome() {
  const { data: user } = useCurrentUser();
  const profile = useMyProfile();
  const terms = useMyTerms();
  const [termId, setTermId] = useState("");
  const [sessionId, setSessionId] = useState("");

  const termOptions = (terms.data?.sessions ?? []).flatMap((session) =>
    session.terms.map((term) => ({
      id: term.id,
      sessionId: session.id,
      sessionName: session.name,
      termName: term.name,
      isCurrent: term.isCurrent,
      label: `${formatTermName(term.name)} — ${session.name}${term.isCurrent ? " (current)" : ""}`,
    })),
  );

  // Default to the current term once the list loads — a student most
  // often wants "now," but every term they were ever enrolled in stays
  // pickable (a just-closed term's report card is the other common case).
  useEffect(() => {
    if (termId || termOptions.length === 0) return;
    const current = termOptions.find((option) => option.isCurrent) ?? termOptions[termOptions.length - 1];
    setTermId(current.id);
    setSessionId(current.sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms.data]);

  const ready = Boolean(termId && sessionId);
  const reportCard = useMyReportCard(ready ? { termId, sessionId } : null);
  const selectedOption = termOptions.find((option) => option.id === termId);

  return (
    <div>
      <PageHeader title={`Welcome, ${user?.firstName ?? ""}`} description={profile.data?.currentClassArmLabel ?? user?.school.name} />

      <div className="mb-4 flex flex-col gap-1.5">
        <Label htmlFor="portal-term">Term</Label>
        <select
          id="portal-term"
          className={SELECT_CLASS}
          value={termId}
          onChange={(event) => {
            const option = termOptions.find((o) => o.id === event.target.value);
            if (option) {
              setTermId(option.id);
              setSessionId(option.sessionId);
            }
          }}
          disabled={terms.isLoading}
        >
          <option value="" disabled>
            Select…
          </option>
          {termOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {!terms.isLoading && !ready && termOptions.length === 0 && (
        <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
          No terms yet — check back once you've been enrolled this session.
        </p>
      )}

      {ready && reportCard.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading your report card…
        </div>
      )}

      {ready && reportCard.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-danger">{getErrorMessage(reportCard.error, "Couldn't load your report card.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => reportCard.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {ready && reportCard.data && (
        <ReportCardDocument
          data={reportCard.data}
          schoolName={user?.school.name}
          classArmLabel={profile.data?.currentClassArmLabel}
          termLabel={selectedOption ? formatTermName(selectedOption.termName) : null}
          sessionLabel={selectedOption?.sessionName}
          showTeacherForm={false}
          showPrincipalForm={false}
        />
      )}
    </div>
  );
}

// v0.6 step 2 (SPEC_V0.6.md §5 step 2): PARENT's own read view is step 4 —
// this placeholder stays for that role until then.
function ParentPortalHomePlaceholder() {
  const { data: user } = useCurrentUser();
  return (
    <div>
      <PageHeader title={`Welcome, ${user?.firstName ?? ""}`} description={user?.school.name} />
      <Card>
        <CardContent className="p-6 text-sm text-muted">
          <p>Your children's results and report cards will appear here soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function PortalHome() {
  const { data: user } = useCurrentUser();
  if (user?.role === "STUDENT") {
    return <StudentPortalHome />;
  }
  return <ParentPortalHomePlaceholder />;
}
