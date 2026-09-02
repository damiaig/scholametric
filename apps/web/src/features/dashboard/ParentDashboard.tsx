import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Trophy, Users, BookOpen, Hammer } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { StatCard } from "../../components/ui/stat-card";
import { Spinner } from "../../components/ui/spinner";
import { formatScore } from "../grades/format-score";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyChildren } from "./use-my-children";
import { useChildTerms } from "./use-child-terms";
import { useChildReportCard } from "../grades/use-child-report-card";
import { useChildYearExams } from "../grades/use-child-year-exams";
import { resolveCurrentTerm } from "./resolve-current-term";
import { buildGradesBySubject } from "./recent-grades";
import { GradesBySubjectCard } from "./GradesBySubjectCard";
import { ChildSwitcher } from "./ChildSwitcher";

function positionLabel(position: number | null): string {
  return position === null ? "Not yet ranked" : `#${position}`;
}

// SPEC_V0.7.1.md §2.4 (approved mockup) — same three sections as
// StudentDashboard, per selected child, with a child-switcher on top.
// `useMyChildren()` is the SAME v0.6 allow-list PortalHome/MyGradesPage
// already used — display only, unchanged. Every number reuses
// GET /me/children/:childId/report-card and /year-exams exactly as
// MyGradesPage does; the published-only wall and anonymity hold by
// construction (same endpoints, no new filtering here).
export function ParentDashboard() {
  const { data: user } = useCurrentUser();
  const children = useMyChildren();
  const [childId, setChildId] = useState("");

  useEffect(() => {
    if (childId || (children.data?.children.length ?? 0) === 0) return;
    setChildId(children.data!.children[0].studentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.data]);

  const terms = useChildTerms(childId || null);
  const current = resolveCurrentTerm(terms.data);

  const reportCard = useChildReportCard(childId && current ? { childId, termId: current.termId, sessionId: current.sessionId } : null);
  const yearExams = useChildYearExams(childId && current ? { childId, sessionId: current.sessionId } : null);
  const currentTermExams = yearExams.data?.terms.find((t) => t.termId === current?.termId);
  const rows = buildGradesBySubject(reportCard.data, currentTermExams);
  const overall = reportCard.data?.overall ?? null;

  return (
    <div>
      <PageHeader title={`Welcome, ${user?.firstName ?? ""}`} description={user?.school.name} />

      {children.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading…
        </div>
      )}

      {!children.isLoading && (children.data?.children.length ?? 0) === 0 && (
        <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
          No children linked to your account yet.
        </p>
      )}

      {(children.data?.children.length ?? 0) > 0 && (
        <ChildSwitcher children={children.data!.children} selectedChildId={childId} onSelect={setChildId} />
      )}

      {childId && !terms.isLoading && !current && (
        <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
          No terms yet for this child — check back once they've been enrolled this session.
        </p>
      )}

      {childId && current && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard icon={Award} label="Average /100" value={overall ? formatScore(overall.averageScore) : "—"} tone="primary" />
            <StatCard
              icon={Users}
              label="Class average /100"
              value={overall?.generalClassAverage != null ? formatScore(overall.generalClassAverage) : "—"}
              tone="secondary"
            />
            <StatCard icon={Trophy} label="Position" value={positionLabel(overall?.overallPosition ?? null)} tone="accent" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <GradesBySubjectCard rows={rows} gradesHref={`/me/grades?childId=${childId}`} />
            </div>

            <div className="flex flex-col gap-4">
              <Link to={`/me/grades?childId=${childId}`} className="block">
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="flex items-center gap-4 p-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <BookOpen className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="font-semibold text-text">Grades</p>
                  </CardContent>
                </Card>
              </Link>

              <Card className="opacity-60">
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/10 text-muted">
                    <Hammer className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-semibold text-text">Homework</p>
                    <p className="text-xs text-muted">Coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
