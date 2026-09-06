import {
  useNavigate,
  useParams,
  useSearchParams,
  Link,
} from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
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
// ever SET it. v0.7.2 step 2 (SPEC_V0.7.2.md §3): visiting Enter-scores
// with no subjectId at all (e.g. GradesLandingPage's classTeacherOf/
// class-browser cards, which only ever point at Results) now shows a
// clickable subject list instead of a dead-end message — reusing
// armDetail.data.subjectTeachers, already fetched above, zero new query.
// This is what makes the admin path work at all now that the class page
// (ClassArmDetailPage) no longer carries any per-subject grading links.
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
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-danger">
            {getErrorMessage(armDetail.error, "Couldn't load this class.")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => armDetail.refetch()}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const armLabel = `${armDetail.data.classLevel.name} ${armDetail.data.name}`;

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mb-4"
        onClick={() => navigate(`/classes/arms/${classArmId}`)}
      >
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
          <ResultsTab classArmId={classArmId} armLabel={armLabel} />
        ) : subjectId ? (
          <EnterScoresTab
            classArmId={classArmId}
            subjectId={subjectId}
            track={track}
            onTrackChange={setTrack}
          />
        ) : (
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-2 text-lg font-semibold text-text">
                Pick a subject to enter scores
              </h2>
              {armDetail.data.subjectTeachers.length === 0 ? (
                <p className="text-sm text-muted">
                  No subject teachers assigned this session.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {armDetail.data.subjectTeachers.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-muted/20 p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-text">
                          {entry.subjectName}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {entry.teacherFirstName} {entry.teacherLastName}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Link
                          to={`/grades/arms/${classArmId}?tab=enter&subjectId=${entry.subjectId}&track=evaluations`}
                          className="text-sm text-primary hover:underline"
                        >
                          Enter grades
                        </Link>
                        <Link
                          to={`/grades/arms/${classArmId}?tab=enter&subjectId=${entry.subjectId}&track=exams`}
                          className="text-sm text-primary hover:underline"
                        >
                          Enter exam scores
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </Tabs>
    </div>
  );
}
