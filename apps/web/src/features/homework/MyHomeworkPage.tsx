import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { useMyChildren } from "../dashboard/use-my-children";
import { HomeworkDueDateList } from "./HomeworkDueDateList";
import { useChildHomework, useMarkHomeworkDone, useMyAttachmentDownloadUrl, useMyHomework } from "./use-my-homework";
import { useSubmitMyHomeworkFile } from "./use-my-homework-submissions";
import { getAttachErrorMessage } from "./use-homework-attachments";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-muted bg-card px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-64";

// v0.8.2 step 6 (SPEC_V0.8.2.md §6 item 6) — the Pronote-style STUDENT
// view: mark-done + upload are both live. Mirrors MyGradesPage's own
// MyGrades/ChildGrades split shape below.
function MyHomework() {
  const homeworkQuery = useMyHomework();
  const markDone = useMarkHomeworkDone();
  const downloadUrl = useMyAttachmentDownloadUrl();
  const submitFile = useSubmitMyHomeworkFile();
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);

  function handleMarkDone(homeworkId: string, markedDone: boolean) {
    markDone.mutate({ homeworkId, markedDone });
  }

  function handleDownloadAttachment(homeworkId: string, attachmentId: string) {
    downloadUrl.mutate(
      { homeworkId, attachmentId },
      { onSuccess: (data) => window.open(data.downloadUrl, "_blank", "noopener,noreferrer") },
    );
  }

  function handleUploadFile(homeworkId: string, file: File) {
    setActiveUploadId(homeworkId);
    submitFile.mutate({ homeworkId, file });
  }

  return (
    <div>
      <PageHeader title="Homework" />

      {homeworkQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading your homework…
        </div>
      )}

      {homeworkQuery.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">{getErrorMessage(homeworkQuery.error, "Couldn't load your homework.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => homeworkQuery.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {homeworkQuery.data && (
        <HomeworkDueDateList
          homework={homeworkQuery.data.homework}
          editable
          onMarkDone={handleMarkDone}
          onDownloadAttachment={handleDownloadAttachment}
          onUploadFile={handleUploadFile}
          activeUploadHomeworkId={activeUploadId}
          isUploading={submitFile.isPending}
          uploadError={submitFile.isError ? getAttachErrorMessage(submitFile.error) : null}
        />
      )}
    </div>
  );
}

// v0.8.2 step 6 — the PARENT's per-child read view. Genuinely read-only:
// no onMarkDone/onUploadFile passed to HomeworkDueDateList at all (not
// just disabled — the controls don't exist in the DOM), matching the
// backend's own no-parent-write design (Step 2's ruling, reconfirmed this
// step). Same child-switcher shape as MyGradesPage's ChildGrades: childId
// lives in ?childId=, defaults to the first linked child, stays shareable.
function ChildHomework() {
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

  const homeworkQuery = useChildHomework(childId || null);

  function handleChildChange(nextChildId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("childId", nextChildId);
    setSearchParams(next, { replace: true });
  }

  return (
    <div>
      <PageHeader title="Homework" />

      {!children.isLoading && (children.data?.children.length ?? 0) === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted">No children linked to your account yet.</p>
          </CardContent>
        </Card>
      )}

      {(children.data?.children.length ?? 0) > 0 && (
        <div className="mb-4 flex flex-col gap-1.5">
          <Label htmlFor="portal-homework-child">Child</Label>
          <select
            id="portal-homework-child"
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

      {childId && homeworkQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading homework…
        </div>
      )}

      {childId && homeworkQuery.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-danger">{getErrorMessage(homeworkQuery.error, "Couldn't load this child's homework.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => homeworkQuery.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {childId && homeworkQuery.data && <HomeworkDueDateList homework={homeworkQuery.data.homework} editable={false} />}
    </div>
  );
}

export function MyHomeworkPage() {
  const { data: user } = useCurrentUser();
  if (user?.role === "STUDENT") {
    return <MyHomework />;
  }
  return <ChildHomework />;
}
