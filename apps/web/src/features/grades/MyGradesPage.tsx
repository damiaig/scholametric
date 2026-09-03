import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { ReportCardDocument } from "./ReportCardDocument";
import { YearExamsView } from "./YearExamsView";
import { useMyReportCard } from "./use-my-report-card";
import { useChildReportCard } from "./use-child-report-card";
import { useMyYearExams } from "./use-my-year-exams";
import { useChildYearExams } from "./use-child-year-exams";
import { useMyProfile } from "../dashboard/use-my-profile";
import { useMyTerms } from "../dashboard/use-my-terms";
import { useMyChildren } from "../dashboard/use-my-children";
import { useChildTerms } from "../dashboard/use-child-terms";

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

// SPEC_V0.7.1.md §3 (item 20) — the dedicated student/parent Grades page,
// at /me/grades. This is PortalHome.tsx's exact former content (the full
// report-card/year-exams document + term/exams selector), relocated off
// /dashboard now that the dashboard itself shows summarized stat cards
// instead (StudentDashboard/ParentDashboard) — a pure move, same hooks,
// same components, same two-mode selector, zero behavior change. The
// whole-year exams mode is kept exactly as it was — nothing here says to
// drop a working feature.
function MyGrades() {
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
  const examsOptions = (terms.data?.sessions ?? []).map((session) => ({
    sessionId: session.id,
    label: `Exams — ${session.name}`,
  }));

  useEffect(() => {
    if (termId || termOptions.length === 0) return;
    const current =
      termOptions.find((option) => option.isCurrent) ??
      termOptions[termOptions.length - 1];
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
  const reportCard = useMyReportCard(
    viewMode === "term" && ready ? { termId, sessionId } : null,
  );
  const yearExams = useMyYearExams(
    viewMode === "exams" && sessionId ? { sessionId } : null,
  );
  const selectedOption = termOptions.find((option) => option.id === termId);
  const selectValue =
    viewMode === "exams" ? `${EXAMS_OPTION_PREFIX}${sessionId}` : termId;

  return (
    <div>
      <PageHeader
        title="Grades"
        description={profile.data?.currentClassArmLabel ?? user?.school.name}
      />

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
              <option
                key={`${EXAMS_OPTION_PREFIX}${option.sessionId}`}
                value={`${EXAMS_OPTION_PREFIX}${option.sessionId}`}
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {!terms.isLoading && termOptions.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted">
              No terms yet — check back once you've been enrolled this session.
            </p>
          </CardContent>
        </Card>
      )}

      {viewMode === "term" && ready && reportCard.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading your report card…
        </div>
      )}

      {viewMode === "term" && ready && reportCard.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">
              {getErrorMessage(
                reportCard.error,
                "Couldn't load your report card.",
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => reportCard.refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {viewMode === "exams" && sessionId && yearExams.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading your exams…
        </div>
      )}

      {viewMode === "exams" && sessionId && yearExams.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">
              {getErrorMessage(yearExams.error, "Couldn't load your exams.")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => yearExams.refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {viewMode === "exams" && sessionId && yearExams.data && (
        <YearExamsView data={yearExams.data} />
      )}

      {viewMode === "term" && ready && reportCard.data && (
        <ReportCardDocument
          data={reportCard.data}
          schoolName={user?.school.name}
          classArmLabel={profile.data?.currentClassArmLabel}
          termLabel={
            selectedOption ? formatTermName(selectedOption.termName) : null
          }
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
// read scope as MyGrades above, for EACH of their directly-linked
// children, via a child-switcher. `childId` now lives in the query string
// (?childId=) rather than only local state — so the dashboard's per-child
// "View all →" link can point straight at a specific child's grades. A
// missing/invalid childId falls back to the parent's first linked child,
// same default today's dashboard child-switcher already applies.
function ChildGrades() {
  const { data: user } = useCurrentUser();
  const children = useMyChildren();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedChildId = searchParams.get("childId") ?? "";
  const validChildId =
    requestedChildId &&
    children.data?.children.some(
      (child) => child.studentId === requestedChildId,
    )
      ? requestedChildId
      : "";
  const childId = validChildId || (children.data?.children[0]?.studentId ?? "");

  // Once the children list loads, if the URL didn't already name a valid
  // child, settle it onto the resolved default so the URL stays shareable.
  useEffect(() => {
    if (!children.data || requestedChildId === childId || !childId) return;
    const next = new URLSearchParams(searchParams);
    next.set("childId", childId);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.data, childId]);

  const selectedChild =
    children.data?.children.find((child) => child.studentId === childId) ??
    null;

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
    const current =
      termOptions.find((option) => option.isCurrent) ??
      termOptions[termOptions.length - 1];
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

  function handleChildChange(nextChildId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("childId", nextChildId);
    setSearchParams(next, { replace: true });
  }

  const ready = Boolean(childId && termId && sessionId);
  const reportCard = useChildReportCard(
    viewMode === "term" && ready ? { childId, termId, sessionId } : null,
  );
  const yearExams = useChildYearExams(
    viewMode === "exams" && childId && sessionId
      ? { childId, sessionId }
      : null,
  );
  const selectedTermOption = termOptions.find((option) => option.id === termId);
  const selectValue =
    viewMode === "exams" ? `${EXAMS_OPTION_PREFIX}${sessionId}` : termId;

  return (
    <div>
      <PageHeader title="Grades" description={user?.school.name} />

      {!children.isLoading && (children.data?.children.length ?? 0) === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted">
              No children linked to your account yet.
            </p>
          </CardContent>
        </Card>
      )}

      {(children.data?.children.length ?? 0) > 0 && (
        <div className="mb-4 flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="portal-child">Child</Label>
            <select
              id="portal-child"
              className={SELECT_CLASS}
              value={childId}
              onChange={(event) => handleChildChange(event.target.value)}
              disabled={children.isLoading}
            >
              <option value="" disabled>
                Select…
              </option>
              {children.data?.children.map((child) => (
                <option key={child.studentId} value={child.studentId}>
                  {child.firstName} {child.lastName}
                  {child.currentClassArmLabel
                    ? ` — ${child.currentClassArmLabel}`
                    : ""}
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
                <option
                  key={`${EXAMS_OPTION_PREFIX}${option.sessionId}`}
                  value={`${EXAMS_OPTION_PREFIX}${option.sessionId}`}
                >
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
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">
              {getErrorMessage(
                reportCard.error,
                "Couldn't load this report card.",
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => reportCard.refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {viewMode === "exams" && childId && sessionId && yearExams.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading exams…
        </div>
      )}

      {viewMode === "exams" && childId && sessionId && yearExams.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">
              {getErrorMessage(yearExams.error, "Couldn't load exams.")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => yearExams.refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {viewMode === "exams" && childId && sessionId && yearExams.data && (
        <YearExamsView data={yearExams.data} />
      )}

      {viewMode === "term" && ready && reportCard.data && (
        <ReportCardDocument
          data={reportCard.data}
          schoolName={user?.school.name}
          classArmLabel={selectedChild?.currentClassArmLabel}
          termLabel={
            selectedTermOption
              ? formatTermName(selectedTermOption.termName)
              : null
          }
          sessionLabel={selectedTermOption?.sessionName}
          showTeacherForm={false}
          showPrincipalForm={false}
          examsViewer={childId ? { kind: "child", childId } : undefined}
        />
      )}
    </div>
  );
}

export function MyGradesPage() {
  const { data: user } = useCurrentUser();
  if (user?.role === "STUDENT") {
    return <MyGrades />;
  }
  return <ChildGrades />;
}
