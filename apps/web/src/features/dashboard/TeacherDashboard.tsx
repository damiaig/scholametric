import { Link } from "react-router-dom";
import { Users, BookOpen, ClipboardPen } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { StatCard } from "../../components/ui/stat-card";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyTeaching } from "./use-my-teaching";
import { MyClassesView } from "./MyClassesView";
import { RecentlyPostedCard } from "./RecentlyPostedCard";
import { useRecentlyPosted } from "./use-recently-posted";

// v0.7.1 step 3 (SPEC_V0.7.1.md §6 step 3, items 2.2/2.3) — replaces the
// bare MyClassesView-only /dashboard for TEACHER with metric cards + the
// same MyClassesView content (untouched, reused as-is per the ruling) +
// a "Recently posted" card. "Needs grading" is deliberately absent — no
// existing endpoint gives an aggregate ungraded count without an unbounded
// per-evaluation fan-out; see docs/DECISIONS.md.
export function TeacherDashboard() {
  const { data: user } = useCurrentUser();
  const teaching = useMyTeaching();
  const recentlyPosted = useRecentlyPosted(teaching.data);

  const classCount = teaching.data
    ? new Set([
        ...teaching.data.classTeacherOf.map((entry) => entry.classArmId),
        ...teaching.data.subjects.map((entry) => entry.classArmId),
      ]).size
    : 0;
  const subjectCount = teaching.data?.subjects.length ?? 0;

  return (
    <div>
      <PageHeader title="My Classes" description={user?.school.name} />

      {teaching.isLoading && <TeacherDashboardSkeleton />}

      {teaching.isError && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-danger">
            {getErrorMessage(
              teaching.error,
              "Couldn't load your teaching load.",
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => teaching.refetch()}
          >
            Try again
          </Button>
        </div>
      )}

      {teaching.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={Users}
              label="Classes I teach"
              value={classCount}
              tone="primary"
            />
            <StatCard
              icon={BookOpen}
              label="Subjects"
              value={subjectCount}
              tone="secondary"
            />
            <Link to="/grades" className="block">
              <Card className="h-full transition-colors hover:border-accent/40">
                <CardContent className="flex h-full items-center gap-4 p-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <ClipboardPen className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="font-semibold text-text">Enter grades →</p>
                </CardContent>
              </Card>
            </Link>
          </div>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-lg font-semibold text-text">
                My classes
              </h2>
              <MyClassesView />
            </CardContent>
          </Card>

          <RecentlyPostedCard {...recentlyPosted} />
        </div>
      )}
    </div>
  );
}

function TeacherDashboardSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="Loading your dashboard"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-lg border border-muted/20 bg-card"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border border-muted/20 bg-card" />
    </div>
  );
}
