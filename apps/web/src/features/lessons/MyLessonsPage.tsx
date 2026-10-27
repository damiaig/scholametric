import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyChildren } from "../dashboard/use-my-children";
import { LessonDateList } from "./LessonDateList";
import { useChildLessonAttachmentDownloadUrl, useChildLessons, useMyLessonAttachmentDownloadUrl, useMyLessons } from "./use-my-lessons";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-64";

// v0.8.4 step 5 (SPEC_V0.8.4.md §6 step 5) — the STUDENT's own cahier-de-
// textes read view. Genuinely read-only: no mark-done, no upload — those
// don't exist for Lessons at all (see LessonDateList's own doc comment).
function MyLessons() {
  const lessonsQuery = useMyLessons();
  const downloadUrl = useMyLessonAttachmentDownloadUrl();

  function handleDownloadAttachment(lessonId: string, attachmentId: string) {
    downloadUrl.mutate(
      { lessonId, attachmentId },
      { onSuccess: (data) => window.open(data.downloadUrl, "_blank", "noopener,noreferrer") },
    );
  }

  return (
    <div>
      <PageHeader title="Lessons" />

      {lessonsQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading your lessons…
        </div>
      )}

      {lessonsQuery.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">{getErrorMessage(lessonsQuery.error, "Couldn't load your lessons.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => lessonsQuery.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {lessonsQuery.data && <LessonDateList lessons={lessonsQuery.data.lessons} onDownloadAttachment={handleDownloadAttachment} />}
    </div>
  );
}

// v0.8.4 step 5 — the PARENT's per-child read view. Same child-switcher
// shape as ChildHomework: childId lives in ?childId=, defaults to the
// first linked child, stays shareable. A plain <select>, not the
// dashboard-only card ChildSwitcher component (confirmed at plan time
// neither MyHomeworkPage nor MyGradesPage use it for this kind of page
// either).
function ChildLessons() {
  const children = useMyChildren();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedChildId = searchParams.get("childId") ?? "";
  const validChildId =
    requestedChildId && children.data?.children.some((child) => child.studentId === requestedChildId) ? requestedChildId : "";
  const childId = validChildId || (children.data?.children[0]?.studentId ?? "");

  useEffect(() => {
    if (!children.data || requestedChildId === childId || !childId) return;
    const next = new URLSearchParams(searchParams);
    next.set("childId", childId);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.data, childId]);

  const lessonsQuery = useChildLessons(childId || null);
  const downloadUrl = useChildLessonAttachmentDownloadUrl();

  function handleChildChange(nextChildId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("childId", nextChildId);
    setSearchParams(next, { replace: true });
  }

  function handleDownloadAttachment(lessonId: string, attachmentId: string) {
    downloadUrl.mutate(
      { childId, lessonId, attachmentId },
      { onSuccess: (data) => window.open(data.downloadUrl, "_blank", "noopener,noreferrer") },
    );
  }

  return (
    <div>
      <PageHeader title="Lessons" />

      {!children.isLoading && (children.data?.children.length ?? 0) === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted">No children linked to your account yet.</p>
          </CardContent>
        </Card>
      )}

      {(children.data?.children.length ?? 0) > 0 && (
        <div className="mb-4 flex flex-col gap-1.5">
          <Label htmlFor="portal-lessons-child">Child</Label>
          <select
            id="portal-lessons-child"
            className={SELECT_CLASS}
            value={childId}
            onChange={(event) => handleChildChange(event.target.value)}
            disabled={children.isLoading}
          >
            <option value="" disabled>
              Select…
            </option>
            {children.data?.children.map((child) => (
              <option key={child.studentId} value={child.studentId}>
                {child.firstName} {child.lastName}
                {child.currentClassArmLabel ? ` — ${child.currentClassArmLabel}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {childId && lessonsQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading lessons…
        </div>
      )}

      {childId && lessonsQuery.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">{getErrorMessage(lessonsQuery.error, "Couldn't load this child's lessons.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => lessonsQuery.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {childId && lessonsQuery.data && <LessonDateList lessons={lessonsQuery.data.lessons} onDownloadAttachment={handleDownloadAttachment} />}
    </div>
  );
}

export function MyLessonsPage() {
  const { data: user } = useCurrentUser();
  if (user?.role === "STUDENT") {
    return <MyLessons />;
  }
  return <ChildLessons />;
}
