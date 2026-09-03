import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { CircleAlert, Users, GraduationCap, School, ClipboardCheck, KeyRound } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { StatCard } from "../../components/ui/stat-card";
import { EmptySessionBanner } from "../../components/EmptySessionBanner";
import { useCurrentUser } from "../shell/use-current-user";
import { useTeachers } from "../teachers/use-teachers";
import { useClasses } from "../classes/use-classes";
import { usePortalAccounts } from "../portal-accounts/use-portal-accounts";
import { useDashboardStats } from "./use-dashboard-stats";
import { computeIntegerTicks } from "./chart-ticks";
import { TeacherDashboard } from "./TeacherDashboard";
import { StudentDashboard } from "./StudentDashboard";
import { ParentDashboard } from "./ParentDashboard";

export function DashboardPage() {
  const { data: user } = useCurrentUser();

  // SPEC_V0.7.1.md §6 step 3 (items 2.2/2.3) — TEACHER sees a metric-card
  // dashboard (classes/subjects + My classes + Recently posted) in place
  // of the admin dashboard, same /dashboard route.
  if (user?.role === "TEACHER") {
    return <TeacherDashboard />;
  }

  // SPEC_V0.7.1.md §2.1/§2.4 — STUDENT/PARENT get a summarized, stat-card
  // dashboard now (formerly PortalHome, which dumped the whole report
  // card here — that full document lives at /me/grades, MyGradesPage,
  // now). Same route, same role gate; only the content changed.
  if (user?.role === "STUDENT") {
    return <StudentDashboard />;
  }
  if (user?.role === "PARENT") {
    return <ParentDashboard />;
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const { data: user } = useCurrentUser();
  const stats = useDashboardStats();
  const teachers = useTeachers({ page: 1, pageSize: 1, search: "" });
  const classes = useClasses();
  const portalAccounts = usePortalAccounts({ page: 1, pageSize: 1 });
  const yAxisTicks = stats.data
    ? computeIntegerTicks(Math.max(0, ...stats.data.studentsByLevel.map((level) => level.count)))
    : [];

  const sessionDescription = !stats.data
    ? undefined
    : stats.data.currentSession
      ? `${stats.data.currentSession}${stats.data.currentTerm ? ` (${formatTerm(stats.data.currentTerm)})` : ""}`
      : "No active session yet";
  const description = user ? [user.school.name, sessionDescription].filter(Boolean).join(" · ") : undefined;

  const classCount = classes.data ? classes.data.reduce((sum, level) => sum + level.arms.length, 0) : 0;

  return (
    <div>
      <PageHeader title="Dashboard" description={description} />

      {stats.isLoading && <DashboardSkeleton />}

      {stats.isError && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <CircleAlert className="h-8 w-8 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">Couldn&apos;t load dashboard stats.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => stats.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {stats.data && (
        <div className="flex flex-col gap-6">
          {stats.data.currentSession && stats.data.totalActiveStudents === 0 && (
            <EmptySessionBanner sessionName={stats.data.currentSession} />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard icon={Users} label="Students" value={stats.data.totalActiveStudents} tone="primary" />
            <StatCard
              icon={GraduationCap}
              label="Teachers"
              value={teachers.isLoading ? "…" : teachers.isError ? "—" : (teachers.data?.total ?? 0)}
              tone="secondary"
            />
            <StatCard
              icon={School}
              label="Classes"
              value={classes.isLoading ? "…" : classes.isError ? "—" : classCount}
              tone="accent"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link to="/grades/review" className="block">
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="flex h-full items-center gap-4 p-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="font-semibold text-text">Review &amp; Publish →</p>
                </CardContent>
              </Card>
            </Link>

            <Card>
              <CardContent className="flex items-center justify-between gap-4 p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                    <KeyRound className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm text-muted">Portal accounts</p>
                    {portalAccounts.isLoading && <p className="text-lg font-semibold text-text">…</p>}
                    {portalAccounts.isError && <p className="text-sm text-danger">Couldn&apos;t load.</p>}
                    {portalAccounts.data && (
                      <p className="text-lg font-semibold text-text">{portalAccounts.data.total} provisioned</p>
                    )}
                  </div>
                </div>
                <Link to="/settings/portal-accounts" className="shrink-0 text-sm text-primary hover:underline">
                  Provision →
                </Link>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-base font-semibold text-text">Students by class level</h2>
              {stats.data.studentsByLevel.length === 0 ? (
                <p className="text-sm text-muted">No students enrolled in the current session yet.</p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.data.studentsByLevel} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#6B728033" vertical={false} />
                      <XAxis dataKey="levelName" tick={{ fill: "#6B7280", fontSize: 12 }} interval={0} />
                      <YAxis
                        allowDecimals={false}
                        domain={[0, yAxisTicks[yAxisTicks.length - 1]]}
                        ticks={yAxisTicks}
                        interval={0}
                        tick={{ fill: "#6B7280", fontSize: 12 }}
                        width={36}
                      />
                      <Tooltip cursor={{ fill: "#1E4ED80D" }} />
                      <Bar dataKey="count" name="Students" fill="#1E4ED8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function formatTerm(term: string): string {
  return term.charAt(0) + term.slice(1).toLowerCase() + " term";
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-20 animate-pulse rounded-lg border border-muted/20 bg-card" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="h-20 animate-pulse rounded-lg border border-muted/20 bg-card" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-lg border border-muted/20 bg-card" />
    </div>
  );
}
