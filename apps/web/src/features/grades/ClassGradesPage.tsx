import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/ui/button";
import { Tabs } from "../../components/ui/tabs";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useClassArmDetail } from "../classes/use-class-arm-detail";
import { EnterScoresTab } from "./EnterScoresTab";
import { ResultsTab } from "./ResultsTab";

// SPEC_V0.7.1.md §3 (items 5, 6, 7, 8) — grades live INSIDE the class, one
// unified area with two tabs (Enter scores | Results), replacing the
// scattered /grades/grid, /grades/exams-grid, /grades/overview split.
// classArmId now comes from the ROUTE (:id), not an optional query string —
// it's structurally always present, so there's no "redirect away if
// missing" guard to write here (every real link is a route to a specific
// class; a bare/garbage id just 404s through useClassArmDetail like any
// other failed load in this app).
//
// `subjectId` persists across tab switches (switching to Results and back
// to Enter scores restores exactly where you were, rather than losing
// context) — only the "Enter grades"/"Enter exam scores" links themselves
// ever SET it. Visiting Enter-scores with no subjectId at all (e.g. the
// class-level "Grades" button, which only ever points at Results) shows a
// named next step instead of a blank grid — see EnterScoresTab's caller
// below.
export function ClassGradesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const classArmId = id ?? "";
  const subjectId = searchParams.get("subjectId") ?? "";
  const track = searchParams.get("track") === "exams" ? "exams" : "evaluations";
  const tab = searchParams.get("tab") === "enter" ? "enter" : "results";

  const armDetail = useClassArmDetail(classArmId, 1, 1);

  function setTab(nextTab: string) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  }

  function setTrack(nextTrack: string) {
    const next = new URLSearchParams(searchParams);
    next.set("track", nextTrack);
    setSearchParams(next, { replace: true });
  }

  if (armDetail.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading class…
      </div>
    );
  }

  if (armDetail.isError || !armDetail.data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
        <p className="text-sm text-danger">{getErrorMessage(armDetail.error, "Couldn't load this class.")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => armDetail.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const armLabel = `${armDetail.data.classLevel.name} ${armDetail.data.name}`;

  return (
    <div>
      <Button type="button" variant="outline" size="sm" className="mb-4" onClick={() => navigate(`/classes/arms/${classArmId}`)}>
        Back to {armLabel}
      </Button>

      <PageHeader title="Grades" description={armLabel} />

      <Tabs
        value={tab}
        onValueChange={setTab}
        aria-label="Grades area"
        items={[
          { value: "enter", label: "Enter scores" },
          { value: "results", label: "Results" },
        ]}
      >
        {tab === "results" ? (
          <ResultsTab classArmId={classArmId} />
        ) : subjectId ? (
          <EnterScoresTab classArmId={classArmId} subjectId={subjectId} track={track} onTrackChange={setTrack} />
        ) : (
          <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
            Pick a subject from this class's subject-teacher list to enter scores.
          </p>
        )}
      </Tabs>
    </div>
  );
}
