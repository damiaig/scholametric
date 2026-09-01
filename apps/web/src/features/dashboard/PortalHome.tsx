import { useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { ReportCardDocument } from "../grades/ReportCardDocument";
import { YearExamsView } from "../grades/YearExamsView";
import { useMyReportCard } from "../grades/use-my-report-card";
import { useChildReportCard } from "../grades/use-child-report-card";
import { useMyYearExams } from "../grades/use-my-year-exams";
import { useChildYearExams } from "../grades/use-child-year-exams";
import { useMyProfile } from "./use-my-profile";
import { useMyTerms } from "./use-my-terms";
import { useMyChildren } from "./use-my-children";
import { useChildTerms } from "./use-child-terms";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-64";

function formatTermName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase() + " term";
}

// v0.7 step 3 (SPEC_V0.7.md §4) — the year-long Exams view is a 4th entry
// in the SAME term selector, not a separate control/route (confirmed) —
// this sentinel prefix distinguishes it from a real term id (a UUID,
// never colliding with this string) in the one shared <select>'s value.
const EXAMS_OPTION_PREFIX = "exams:";

// v0.6 step 3 (SPEC_V0.6.md §2.3): a STUDENT's own read view — their
// published grades + report card, reusing the SAME ReportCardDocument
// renderer the staff-facing ReportCardPage uses (v0.5 step 4), with the
// remark forms always off (read-only, self-view).
function StudentPortalHome() {
  const { data: user } = useCurrentUser();
  const profile = useMyProfile();
  const terms = useMyTerms();
  const [termId, setTermId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [viewMode, setViewMode] = useState<"term" | "exams">("term");

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
  // v0.7 step 3 — one "Exams" entry per session the student has ever been
  // enrolled in, same grouping the term options already use.
  const examsOptions = (terms.data?.sessions ?? []).map((session) => ({
    sessionId: session.id,
    label: `Exams — ${session.name}`,
  }));

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

  function handleSelectChange(value: string) {
    if (value.startsWith(EXAMS_OPTION_PREFIX)) {
      setViewMode("exams");
      setSessionId(value.slice(EXAMS_OPTION_PREFIX.length));
      return;
    }
    const option = termOptions.find((o) => o.id === value);
    if (option) {
      setViewMode("term");
      setTermId(option.id);
      setSessionId(option.sessionId);
    }
  }

  const ready = Boolean(termId && sessionId);
  const reportCard = useMyReportCard(viewMode === "term" && ready ? { termId, sessionId } : null);
  const yearExams = useMyYearExams(viewMode === "exams" && sessionId ? { sessionId } : null);
  const selectedOption = termOptions.find((option) => option.id === termId);
  const selectValue = viewMode === "exams" ? `${EXAMS_OPTION_PREFIX}${sessionId}` : termId;

  return (
    <div>
      <PageHeader title={`Welcome, ${user?.firstName ?? ""}`} description={profile.data?.currentClassArmLabel ?? user?.school.name} />

      {termOptions.length > 0 && (
        <div className="mb-4 flex flex-col gap-1.5">
          <Label htmlFor="portal-term">Term</Label>
          <select
            id="portal-term"
            className={SELECT_CLASS}
            value={selectValue}
            onChange={(event) => handleSelectChange(event.target.value)}
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
            {examsOptions.map((option) => (
              <option key={`${EXAMS_OPTION_PREFIX}${option.sessionId}`} value={`${EXAMS_OPTION_PREFIX}${option.sessionId}`}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {!terms.isLoading && termOptions.length === 0 && (
        <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
          No terms yet — check back once you've been enrolled this session.
        </p>
      )}

      {viewMode === "term" && ready && reportCard.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading your report card…
        </div>
      )}

      {viewMode === "term" && ready && reportCard.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-danger">{getErrorMessage(reportCard.error, "Couldn't load your report card.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => reportCard.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {viewMode === "exams" && sessionId && yearExams.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading your exams…
        </div>
      )}

      {viewMode === "exams" && sessionId && yearExams.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-danger">{getErrorMessage(yearExams.error, "Couldn't load your exams.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => yearExams.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {viewMode === "exams" && sessionId && yearExams.data && <YearExamsView data={yearExams.data} />}

      {viewMode === "term" && ready && reportCard.data && (
        <ReportCardDocument
          data={reportCard.data}
          schoolName={user?.school.name}
          classArmLabel={profile.data?.currentClassArmLabel}
          termLabel={selectedOption ? formatTermName(selectedOption.termName) : null}
          examsViewer={{ kind: "self" }}
          sessionLabel={selectedOption?.sessionName}
          showTeacherForm={false}
          showPrincipalForm={false}
        />
      )}
    </div>
  );
}

// v0.6 step 4 (SPEC_V0.6.md §2.4): a PARENT's own read view — the SAME
// read scope as StudentPortalHome above, for EACH of their directly-
// linked children, via a child-switcher. childId is validated server-side
// against the parent's own children before any grade query runs
// (MeService.assertChildBelongsToCaller) — this component just picks
// among whatever GET /me/children already returned, never an arbitrary id.
function ParentPortalHome() {
  const { data: user } = useCurrentUser();
  const children = useMyChildren();
  const [childId, setChildId] = useState("");

  // Default to the first child once the list loads.
  useEffect(() => {
    if (childId || (children.data?.children.length ?? 0) === 0) return;
    setChildId(children.data!.children[0].studentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.data]);

  const selectedChild = children.data?.children.find((child) => child.studentId === childId) ?? null;

  const terms = useChildTerms(childId || null);
  const [termId, setTermId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [viewMode, setViewMode] = useState<"term" | "exams">("term");

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
  const examsOptions = (terms.data?.sessions ?? []).map((session) => ({
    sessionId: session.id,
    label: `Exams — ${session.name}`,
  }));

  // Switching children resets the term choice — the new child's terms
  // load fresh and default below, same as the initial load.
  useEffect(() => {
    setTermId("");
    setSessionId("");
    setViewMode("term");
  }, [childId]);

  useEffect(() => {
    if (termId || termOptions.length === 0) return;
    const current = termOptions.find((option) => option.isCurrent) ?? termOptions[termOptions.length - 1];
    setTermId(current.id);
    setSessionId(current.sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms.data]);

  function handleSelectChange(value: string) {
    if (value.startsWith(EXAMS_OPTION_PREFIX)) {
      setViewMode("exams");
      setSessionId(value.slice(EXAMS_OPTION_PREFIX.length));
      return;
    }
    const option = termOptions.find((o) => o.id === value);
    if (option) {
      setViewMode("term");
      setTermId(option.id);
      setSessionId(option.sessionId);
    }
  }

  const ready = Boolean(childId && termId && sessionId);
  const reportCard = useChildReportCard(viewMode === "term" && ready ? { childId, termId, sessionId } : null);
  const yearExams = useChildYearExams(viewMode === "exams" && childId && sessionId ? { childId, sessionId } : null);
  const selectedTermOption = termOptions.find((option) => option.id === termId);
  const selectValue = viewMode === "exams" ? `${EXAMS_OPTION_PREFIX}${sessionId}` : termId;

  return (
    <div>
      <PageHeader title={`Welcome, ${user?.firstName ?? ""}`} description={user?.school.name} />

      {!children.isLoading && (children.data?.children.length ?? 0) === 0 && (
        <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
          No children linked to your account yet.
        </p>
      )}

      {(children.data?.children.length ?? 0) > 0 && (
        <div className="mb-4 flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="portal-child">Child</Label>
            <select
              id="portal-child"
              className={SELECT_CLASS}
              value={childId}
              onChange={(event) => setChildId(event.target.value)}
              disabled={children.isLoading}
            >
              <option value="" disabled>
                Select…
              </option>
              {children.data?.children.map((child) => (
                <option key={child.studentId} value={child.studentId}>
                  {child.firstName} {child.lastName}
                  {child.currentClassArmLabel ? ` — ${child.currentClassArmLabel}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="portal-term">Term</Label>
            <select
              id="portal-term"
              className={SELECT_CLASS}
              value={selectValue}
              onChange={(event) => handleSelectChange(event.target.value)}
              disabled={!childId || terms.isLoading}
            >
              <option value="" disabled>
                Select…
              </option>
              {termOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
              {examsOptions.map((option) => (
                <option key={`${EXAMS_OPTION_PREFIX}${option.sessionId}`} value={`${EXAMS_OPTION_PREFIX}${option.sessionId}`}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {viewMode === "term" && ready && reportCard.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading report card…
        </div>
      )}

      {viewMode === "term" && ready && reportCard.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-danger">{getErrorMessage(reportCard.error, "Couldn't load this report card.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => reportCard.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {viewMode === "exams" && childId && sessionId && yearExams.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading exams…
        </div>
      )}

      {viewMode === "exams" && childId && sessionId && yearExams.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-danger">{getErrorMessage(yearExams.error, "Couldn't load exams.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => yearExams.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {viewMode === "exams" && childId && sessionId && yearExams.data && <YearExamsView data={yearExams.data} />}

      {viewMode === "term" && ready && reportCard.data && (
        <ReportCardDocument
          data={reportCard.data}
          schoolName={user?.school.name}
          classArmLabel={selectedChild?.currentClassArmLabel}
          termLabel={selectedTermOption ? formatTermName(selectedTermOption.termName) : null}
          sessionLabel={selectedTermOption?.sessionName}
          showTeacherForm={false}
          showPrincipalForm={false}
          examsViewer={childId ? { kind: "child", childId } : undefined}
        />
      )}
    </div>
  );
}

export function PortalHome() {
  const { data: user } = useCurrentUser();
  if (user?.role === "STUDENT") {
    return <StudentPortalHome />;
  }
  return <ParentPortalHome />;
}
