import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyTeaching } from "../dashboard/use-my-teaching";

// v0.7.2 — a dedicated sidebar home for grades, reversing v0.7.1's "grades
// live inside the class only, no sidebar item" decision (SPEC_V0.7.1.md
// §3.1): a teacher had no fast path to grades without hunting through
// Classes first. This is a THIN picker only — it reuses the SAME
// useMyTeaching() data MyClassesView already fetches (same query key, no
// new network call) and the SAME /classes/arms/:id/grades route Step 1
// already built. No new endpoint, no rebuild of ClassGradesPage. The class-
// teacher-of cards and the subjects table's per-row action links are the
// same content that used to live on the dashboard's MyClassesView — moved
// here, not rebuilt, since a dedicated Grades destination is now the right
// home for them (MyClassesView keeps the class-teacher-of cards + a plain
// subject/class list, see docs/DECISIONS.md).
export function TeacherGradesPage() {
  const { data: user } = useCurrentUser();
  const teaching = useMyTeaching();

  return (
    <div>
      <PageHeader title="Grades" description={user?.school.name} />

      {teaching.isLoading && <TeacherGradesSkeleton />}

      {teaching.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
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
          </CardContent>
        </Card>
      )}

      {teaching.data &&
        teaching.data.classTeacherOf.length === 0 &&
        teaching.data.subjects.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <Users className="h-8 w-8 text-muted" aria-hidden="true" />
              <p className="text-sm text-muted">
                You have no class assignments yet — your school admin assigns
                these.
              </p>
            </CardContent>
          </Card>
        )}

      {teaching.data &&
        (teaching.data.classTeacherOf.length > 0 ||
          teaching.data.subjects.length > 0) && (
          <div className="flex flex-col gap-6">
            <section>
              <h2 className="mb-2 text-lg font-semibold text-text">
                Classes I teach
              </h2>
              {teaching.data.classTeacherOf.length === 0 ? (
                <p className="text-sm text-muted">
                  You are not currently a class teacher for any arm.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {teaching.data.classTeacherOf.map((entry) => (
                    <Link
                      key={entry.classArmId}
                      to={`/classes/arms/${entry.classArmId}/grades?tab=results`}
                      className="block"
                    >
                      <Card className="transition-colors hover:border-primary/40">
                        <CardContent className="flex items-center gap-4 p-6">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Users className="h-5 w-5" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-text">
                              {entry.className}
                            </p>
                            <p className="text-sm text-muted">
                              {entry.enrollmentCount} student
                              {entry.enrollmentCount === 1 ? "" : "s"}
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
              <h2 className="mb-2 text-lg font-semibold text-text">
                Subjects I teach
              </h2>
              {teaching.data.subjects.length === 0 ? (
                <p className="text-sm text-muted">
                  No subjects assigned this session.
                </p>
              ) : (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-muted/20">
                          <th className="px-4 py-3 font-medium text-muted">
                            Subject
                          </th>
                          <th className="px-4 py-3 font-medium text-muted">
                            Class
                          </th>
                          <th className="px-4 py-3 font-medium text-muted">
                            &nbsp;
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {teaching.data.subjects.map((entry) => (
                          <tr
                            key={entry.id}
                            className="border-b border-muted/10 last:border-0"
                          >
                            <td className="px-4 py-3 text-text">
                              {entry.subjectName}
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                to={`/classes/arms/${entry.classArmId}/grades?tab=results`}
                                className="text-primary hover:underline"
                              >
                                {entry.className}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                to={`/classes/arms/${entry.classArmId}/grades?tab=enter&subjectId=${entry.subjectId}&track=evaluations`}
                                className="text-primary hover:underline"
                              >
                                Enter grades
                              </Link>
                              <span className="mx-2 text-muted">·</span>
                              <Link
                                to={`/classes/arms/${entry.classArmId}/grades?tab=enter&subjectId=${entry.subjectId}&track=exams`}
                                className="text-primary hover:underline"
                              >
                                Enter exam scores
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </section>
          </div>
        )}
    </div>
  );
}

function TeacherGradesSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="Loading your teaching load"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-lg border border-muted/20 bg-card"
          />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-lg border border-muted/20 bg-card" />
    </div>
  );
}
