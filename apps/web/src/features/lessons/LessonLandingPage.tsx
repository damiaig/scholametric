import { Link } from "react-router-dom";
import { NotebookText } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useMyTeaching } from "../dashboard/use-my-teaching";

// v0.8.4 step 4 (SPEC_V0.8.4.md §6 step 4) — mirrors HomeworkLandingPage
// exactly (same useMyTeaching() data source, same empty/loading/error
// handling, same "no admin school-wide browse this step" scope call).
export function LessonLandingPage() {
  const teaching = useMyTeaching();

  return (
    <div>
      <PageHeader title="Lessons" />

      {teaching.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading your subjects…
        </div>
      )}

      {teaching.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">{getErrorMessage(teaching.error, "Couldn't load your teaching load.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => teaching.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {teaching.data && teaching.data.subjects.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <NotebookText className="h-8 w-8 text-muted" aria-hidden="true" />
            <p className="text-sm text-muted">You have no subject assignments yet — your school admin assigns these.</p>
          </CardContent>
        </Card>
      )}

      {teaching.data && teaching.data.subjects.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-muted/20">
                  <th className="px-4 py-3 font-medium text-muted">Subject</th>
                  <th className="px-4 py-3 font-medium text-muted">Class</th>
                  <th className="px-4 py-3 font-medium text-muted">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {teaching.data.subjects.map((entry) => (
                  <tr key={entry.id} className="border-b border-muted/10 last:border-0">
                    <td className="px-4 py-3 text-text">{entry.subjectName}</td>
                    <td className="px-4 py-3 text-text">{entry.className}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/lessons/arms/${entry.classArmId}?subjectId=${entry.subjectId}`} className="text-primary hover:underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
