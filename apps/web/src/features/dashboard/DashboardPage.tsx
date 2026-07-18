import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CircleAlert, Users, CalendarDays } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { EmptySessionBanner } from "../../components/EmptySessionBanner";
import { useCurrentUser } from "../shell/use-current-user";
import { useDashboardStats } from "./use-dashboard-stats";

export function DashboardPage() {
  const { data: user } = useCurrentUser();
  const stats = useDashboardStats();

  return (
    <div>
      <PageHeader title="Dashboard" description={user?.school.name} />

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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm text-muted">Active students</p>
                  <p className="text-2xl font-semibold text-text">{stats.data.totalActiveStudents}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                  <CalendarDays className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm text-muted">Current session &amp; term</p>
                  {stats.data.currentSession ? (
                    <p className="text-lg font-semibold text-text">
                      {stats.data.currentSession}
                      {stats.data.currentTerm && (
                        <span className="ml-1 text-sm font-normal text-muted">
                          ({formatTerm(stats.data.currentTerm)})
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-muted">No active session yet</p>
                  )}
                </div>
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
                    <BarChart data={stats.data.studentsByLevel} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#6B728033" vertical={false} />
                      <XAxis dataKey="levelName" tick={{ fill: "#6B7280", fontSize: 12 }} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fill: "#6B7280", fontSize: 12 }} width={32} />
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="h-20 animate-pulse rounded-lg border border-muted/20 bg-card" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-lg border border-muted/20 bg-card" />
    </div>
  );
}
