import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { getErrorMessage } from "../../lib/api-client";
import { useMyTeaching } from "./use-my-teaching";

// Teacher home (SPEC_V0.3.md §4 item 1) — renders in place of the admin
// dashboard at the same /dashboard route when the logged-in user is a
// TEACHER. Reuses GET /me/teaching, which itself reuses the class-teacher/
// subject-teacher query shape from GET /teachers/:userId plus a
// current-session enrollment count (see docs/API.md).
export function MyClassesView() {
  const teaching = useMyTeaching();

  if (teaching.isLoading) {
    return <MyClassesSkeleton />;
  }

  if (teaching.isError || !teaching.data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
        <p className="text-sm text-danger">
          {getErrorMessage(teaching.error, "Couldn't load your teaching load.")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => teaching.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const { classTeacherOf, subjects } = teaching.data;

  if (classTeacherOf.length === 0 && subjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-muted/20 bg-card p-10 text-center">
        <Users className="h-8 w-8 text-muted" aria-hidden="true" />
        <p className="text-sm text-muted">You have no class assignments yet — your school admin assigns these.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-lg font-semibold text-text">Classes I teach</h2>
        {classTeacherOf.length === 0 ? (
          <p className="text-sm text-muted">You are not currently a class teacher for any arm.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classTeacherOf.map((entry) => (
              <Link key={entry.classArmId} to={`/classes/arms/${entry.classArmId}`} className="block">
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="flex items-center gap-4 p-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Users className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text">{entry.className}</p>
                      <p className="text-sm text-muted">
                        {entry.enrollmentCount} student{entry.enrollmentCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-text">Subjects I teach</h2>
        {subjects.length === 0 ? (
          <p className="text-sm text-muted">No subjects assigned this session.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-muted/20 bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-muted/20">
                  <th className="px-4 py-3 font-medium text-muted">Subject</th>
                  <th className="px-4 py-3 font-medium text-muted">Class</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((entry) => (
                  <tr key={entry.id} className="border-b border-muted/10 last:border-0">
                    <td className="px-4 py-3 text-text">{entry.subjectName}</td>
                    <td className="px-4 py-3">
                      <Link to={`/classes/arms/${entry.classArmId}`} className="text-primary hover:underline">
                        {entry.className}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MyClassesSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading your teaching load">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-20 animate-pulse rounded-lg border border-muted/20 bg-card" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-lg border border-muted/20 bg-card" />
    </div>
  );
}
