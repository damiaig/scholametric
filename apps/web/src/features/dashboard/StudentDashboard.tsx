import { Link } from "react-router-dom";
import { Award, Trophy, Users, BookOpen, Hammer } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { StatCard } from "../../components/ui/stat-card";
import { Spinner } from "../../components/ui/spinner";
import { formatScore } from "../grades/format-score";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyProfile } from "./use-my-profile";
import { useMyTerms } from "./use-my-terms";
import { useMyReportCard } from "../grades/use-my-report-card";
import { useMyYearExams } from "../grades/use-my-year-exams";
import { resolveCurrentTerm } from "./resolve-current-term";
import { buildGradesBySubject } from "./recent-grades";
import { GradesBySubjectCard } from "./GradesBySubjectCard";

function positionLabel(position: number | null): string {
  return position === null ? "Not yet ranked" : `#${position}`;
}

// SPEC_V0.7.1.md §2.1 (approved mockup) — replaces the old PortalHome
// dump-the-whole-report-card dashboard with three at-a-glance metric
// cards + a per-subject grades summary + link cards, for the CURRENT
// term only. Every number here is read straight off the SAME
// GET /me/report-card / GET /me/year-exams responses the full Grades
// page (MyGradesPage, at /me/grades) already fetches — the published-
// only wall and the anonymous class-average/best/worst rule hold here
// by construction, not by any new filtering added in this component.
export function StudentDashboard() {
  const { data: user } = useCurrentUser();
  const profile = useMyProfile();
  const terms = useMyTerms();
  const current = resolveCurrentTerm(terms.data);

  const reportCard = useMyReportCard(current ? { termId: current.termId, sessionId: current.sessionId } : null);
  const yearExams = useMyYearExams(current ? { sessionId: current.sessionId } : null);
  const currentTermExams = yearExams.data?.terms.find((t) => t.termId === current?.termId);
  const rows = buildGradesBySubject(reportCard.data, currentTermExams);

  const overall = reportCard.data?.overall ?? null;

  return (
    <div>
      <PageHeader title={`Welcome, ${user?.firstName ?? ""}`} description={profile.data?.currentClassArmLabel ?? user?.school.name} />

      {terms.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading…
        </div>
      )}

      {!terms.isLoading && !current && (
        <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
          No terms yet — check back once you've been enrolled this session.
        </p>
      )}

      {current && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard icon={Award} label="Your average /100" value={overall ? formatScore(overall.averageScore) : "—"} tone="primary" />
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
              <GradesBySubjectCard rows={rows} gradesHref="/me/grades" />
            </div>

            <div className="flex flex-col gap-4">
              <Link to="/me/grades" className="block">
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
