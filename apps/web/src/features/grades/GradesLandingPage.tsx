import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { getErrorMessage } from "../../lib/api-client";
import { isSchoolAdmin } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyTeaching } from "../dashboard/use-my-teaching";
import { useClasses } from "../classes/use-classes";

// v0.7.2 step 2 (SPEC_V0.7.2.md §3, items 2+3) — renamed from
// TeacherGradesPage: with the class page's grading UI removed,
// SCHOOL_ADMIN/PROPRIETOR now land here too (guarded by
// RequireGradesAccess), so a page still named "teacher-only" would lie.
// Content forks by role — TEACHER keeps its exact existing "my classes"
// picker; SCHOOL_ADMIN/PROPRIETOR get a new school-wide class browser,
// since useMyTeaching() (a TEACHER's own assignments) doesn't generalize
// to "every class admin can grade in". Both land on the SAME
// /grades/arms/:id route (ClassGradesPage, unchanged) — this file only
// decides how you GET there, never what happens once you arrive.
export function GradesLandingPage() {
  const { data: user } = useCurrentUser();

  return (
    <div>
      <PageHeader title="Grades" description={user?.school.name} />
      {isSchoolAdmin(user?.role) ? <AdminGradesView /> : <TeacherGradesView />}
    </div>
  );
}

function TeacherGradesView() {
  const teaching = useMyTeaching();

  return (
    <>
      {teaching.isLoading && <PickerSkeleton />}

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
                      to={`/grades/arms/${entry.classArmId}?tab=results`}
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
                                to={`/grades/arms/${entry.classArmId}?tab=results`}
                                className="text-primary hover:underline"
                              >
                                {entry.className}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                to={`/grades/arms/${entry.classArmId}?tab=enter&subjectId=${entry.subjectId}&track=evaluations`}
                                className="text-primary hover:underline"
                              >
                                Enter grades
                              </Link>
                              <span className="mx-2 text-muted">·</span>
                              <Link
                                to={`/grades/arms/${entry.classArmId}?tab=enter&subjectId=${entry.subjectId}&track=exams`}
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
    </>
  );
}

// v0.7.2 step 2 (SPEC_V0.7.2.md §3, Q4) — the admin/proprietor path: the
// class page no longer offers a Grades button, so admins now browse
// school-wide from here instead. Reuses useClasses() — the SAME hook/
// endpoint ClassesPage already calls — no new query. Landing tab is
// always Results (safe regardless of subject); picking a specific
// subject to grade happens on the class's own Grades page, via
// ClassGradesPage's own subject-list (see docs/DECISIONS.md).
function AdminGradesView() {
  const classes = useClasses();

  if (classes.isLoading) {
    return <PickerSkeleton />;
  }

  if (classes.isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-danger">
            {getErrorMessage(classes.error, "Couldn't load classes.")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => classes.refetch()}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const levels = classes.data ?? [];
  const hasAnyArm = levels.some((level) => level.arms.length > 0);

  if (!hasAnyArm) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <Users className="h-8 w-8 text-muted" aria-hidden="true" />
          <p className="text-sm text-muted">
            No classes have been set up yet — add one from the Classes page.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {levels
        .filter((level) => level.arms.length > 0)
        .map((level) => (
          <section key={level.id}>
            <h2 className="mb-2 text-lg font-semibold text-text">
              {level.name}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {level.arms.map((arm) => (
                <Link
                  key={arm.id}
                  to={`/grades/arms/${arm.id}?tab=results`}
                  className="block"
                >
                  <Card className="transition-colors hover:border-primary/40">
                    <CardContent className="flex items-center gap-4 p-6">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Users className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-text">
                          {level.name} {arm.name}
                        </p>
                        <p className="text-sm text-muted">
                          {arm.enrollmentCount} student
                          {arm.enrollmentCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function PickerSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="Loading classes"
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
