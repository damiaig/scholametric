import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Paperclip, X, RefreshCw, Trash2 } from "lucide-react";
import {
  lessonFormSchema,
  LESSON_ATTACHMENT_CAP_BYTES,
  type Lesson,
  type LessonAttachment,
  type LessonFormInput,
  type WeekdayValue,
} from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { StyledDatePicker } from "../../components/ui/styled-date-picker";
import { StyledFileInput } from "../../components/ui/styled-file-input";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { formatBytes } from "../../lib/format-bytes";
import { useCreateLesson, useTeachingWeekdays, useUpdateLesson } from "./use-lessons";
import { useAttachLessonFile, useDeleteLessonAttachment, getAttachErrorMessage } from "./use-lesson-attachments";

// v0.8.4 step 4 (SPEC_V0.8.4.md §6 step 4) — duplicated from
// HomeworkFormDialog.tsx's own identical map (this feature's "duplicate,
// don't cross-import" convention, kept even for this one-line lookup
// table).
const WEEKDAY_BY_JS_INDEX: (WeekdayValue | null)[] = [null, "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

interface LessonFormDialogProps {
  open: boolean;
  onClose: () => void;
  classArmId: string;
  subjectId: string;
  /** When set, edits this lesson instead of creating a new one. */
  lesson?: Lesson | null;
}

interface AttachRow {
  key: string;
  file: File;
  status: "pending" | "error";
  error?: string;
}

const BLANK: LessonFormInput = { title: "", body: "", lessonDate: "" };

// v0.8.4 step 4 — mirrors HomeworkFormDialog's own create-then-attach-on-
// submit shape exactly, minus requiresUpload (doesn't exist for a
// read-only Lesson) and with the picker INVERTED: maxDate="today" (not
// minDate) — a lesson is logged for a day already taught, never the
// future. See that file's own doc comment for the full reasoning behind
// heldFiles/sessionAttachments/deletedAttachmentIds/the partial-failure
// session — the same reasoning applies here unchanged (an attach success
// invalidates the list query, so `lesson` stays a frozen snapshot keyed
// on `open` alone, never re-keyed on `lesson`'s own identity).
export function LessonFormDialog({ open, onClose, classArmId, subjectId, lesson }: LessonFormDialogProps) {
  const isEdit = lesson != null;
  const createLesson = useCreateLesson();
  const updateLesson = useUpdateLesson();
  const attachFile = useAttachLessonFile();
  const mutation = isEdit ? updateLesson : createLesson;

  const teachingWeekdays = useTeachingWeekdays(open ? { classArmId, subjectId } : null);
  const disableDate = useMemo(() => {
    if (teachingWeekdays.isLoading) return undefined; // no restriction while loading — avoids a "nothing pickable" flash
    const allowed = teachingWeekdays.data?.weekdays ?? [];
    return (date: Date) => {
      const weekday = WEEKDAY_BY_JS_INDEX[date.getDay()];
      return !weekday || !allowed.includes(weekday);
    };
  }, [teachingWeekdays.isLoading, teachingWeekdays.data]);
  const hasNoTeachingDays = !teachingWeekdays.isLoading && (teachingWeekdays.data?.weekdays.length ?? 0) === 0;

  const [heldFiles, setHeldFiles] = useState<File[]>([]);
  const [sessionAttachments, setSessionAttachments] = useState<LessonAttachment[]>([]);
  const [attachRows, setAttachRows] = useState<AttachRow[]>([]);
  const [createdLessonId, setCreatedLessonId] = useState<string | null>(null);
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<Set<string>>(new Set());
  const [deletingAttachment, setDeletingAttachment] = useState<LessonAttachment | null>(null);
  const deleteAttachment = useDeleteLessonAttachment();

  // Set once a create-then-attach submit hits a partial failure (some
  // files attached, at least one didn't) — the dialog stays open, acting
  // as an edit session for the lesson that DOES now exist, without
  // rolling it back.
  const isPartialFailureSession = !isEdit && createdLessonId !== null;
  const targetLessonId = lesson?.id ?? createdLessonId;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<LessonFormInput>({
    resolver: zodResolver(lessonFormSchema),
    defaultValues: BLANK,
  });

  // Keyed on `open` ALONE, not on `lesson` — see the component doc
  // comment above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      reset(lesson ? { title: lesson.title, body: lesson.body, lessonDate: lesson.lessonDate } : BLANK);
      setHeldFiles([]);
      setSessionAttachments([]);
      setAttachRows([]);
      setCreatedLessonId(null);
      setDeletedAttachmentIds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const committedAttachments = [...(lesson?.attachments ?? []), ...sessionAttachments].filter((attachment) => !deletedAttachmentIds.has(attachment.id));
  const usedBytes =
    committedAttachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0) + heldFiles.reduce((sum, file) => sum + file.size, 0);
  const remainingBytes = LESSON_ATTACHMENT_CAP_BYTES - usedBytes;
  const capReached = remainingBytes <= 0;

  async function attachOneFile(file: File, lessonId: string): Promise<boolean> {
    const key = `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`;
    setAttachRows((rows) => [...rows, { key, file, status: "pending" }]);
    try {
      const result = await attachFile.mutateAsync({ lessonId, file });
      setAttachRows((rows) => rows.filter((row) => row.key !== key));
      setSessionAttachments((prev) => [...prev, result]);
      return true;
    } catch (error) {
      setAttachRows((rows) => rows.map((row) => (row.key === key ? { ...row, status: "error", error: getAttachErrorMessage(error) } : row)));
      return false;
    }
  }

  function retryRow(key: string) {
    const row = attachRows.find((r) => r.key === key);
    if (!row || !targetLessonId) return;
    setAttachRows((rows) => rows.filter((r) => r.key !== key));
    void attachOneFile(row.file, targetLessonId);
  }

  function dismissRow(key: string) {
    setAttachRows((rows) => rows.filter((row) => row.key !== key));
  }

  function removeHeldFile(index: number) {
    setHeldFiles((files) => files.filter((_, i) => i !== index));
  }

  function confirmDeleteAttachment() {
    if (!deletingAttachment || !targetLessonId) return;
    deleteAttachment.mutate(
      { lessonId: targetLessonId, attachmentId: deletingAttachment.id },
      {
        onSuccess: () => {
          setDeletedAttachmentIds((ids) => new Set(ids).add(deletingAttachment.id));
          setDeletingAttachment(null);
        },
      },
    );
  }

  function handleFileSelect(file: File) {
    if (targetLessonId) {
      void attachOneFile(file, targetLessonId);
    } else {
      setHeldFiles((files) => [...files, file]);
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    if (isEdit && lesson) {
      updateLesson.mutate({ id: lesson.id, input: values }, { onSuccess: () => onClose() });
      return;
    }

    let created: Lesson;
    try {
      created = await createLesson.mutateAsync({ ...values, classArmId, subjectId });
    } catch {
      return; // mutation.isError/mutation.error already set for rendering below
    }

    if (heldFiles.length === 0) {
      onClose();
      return;
    }

    setCreatedLessonId(created.id);
    const filesToAttach = heldFiles;
    setHeldFiles([]);
    let allSucceeded = true;
    for (const file of filesToAttach) {
      const succeeded = await attachOneFile(file, created.id);
      if (!succeeded) allSucceeded = false;
    }
    if (allSucceeded) {
      onClose();
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit lesson" : "New lesson"}>
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">{isEdit ? "Edit lesson" : "New lesson"}</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lesson-title">Title</Label>
          <Input id="lesson-title" placeholder="e.g. Chapter 3: Fractions" disabled={isPartialFailureSession} {...register("title")} />
          <FieldError message={errors.title?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lesson-body">Body</Label>
          <Textarea id="lesson-body" placeholder="What was taught in this lesson" disabled={isPartialFailureSession} {...register("body")} />
          <FieldError message={errors.body?.message} />
        </div>

        {/* Not disabled during the partial-failure session below, same reasoning as
            HomeworkFormDialog's own dueDate field: StyledDatePicker has no disabled
            prop, and it's harmless here regardless. maxDate="today" INVERTS homework's
            minDate="today" — a lesson is logged for a day already taught, never the
            future. */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lesson-date">Lesson date</Label>
          <Controller
            name="lessonDate"
            control={control}
            render={({ field }) => (
              <StyledDatePicker
                id="lesson-date"
                value={field.value}
                onChange={field.onChange}
                maxDate="today"
                disableDate={disableDate}
                placeholder="Select a date…"
              />
            )}
          />
          <FieldError message={errors.lessonDate?.message} />
          {hasNoTeachingDays && (
            <p className="text-xs text-muted">
              No timetable is set up for this class yet — ask your admin to build one before logging a lesson.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label>Attachments</Label>

          {committedAttachments.length === 0 && heldFiles.length === 0 && attachRows.length === 0 ? (
            <p className="text-sm text-muted">No files attached yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {committedAttachments.map((attachment) => (
                <li key={attachment.id} className="flex items-center gap-2 text-sm text-text">
                  <Paperclip className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                  <span className="truncate">{attachment.fileName}</span>
                  <span className="text-xs text-muted">{formatBytes(attachment.sizeBytes)}</span>
                  <button
                    type="button"
                    aria-label={`Delete ${attachment.fileName}`}
                    onClick={() => setDeletingAttachment(attachment)}
                    className="text-muted hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
              {heldFiles.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center gap-2 text-sm text-text">
                  <Paperclip className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                  <span className="truncate">{file.name}</span>
                  <span className="text-xs text-muted">{formatBytes(file.size)}</span>
                  <span className="text-xs text-muted">(will attach on save)</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeHeldFile(index)}
                    className="text-muted hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
              {attachRows.map((row) => (
                <li key={row.key} className="flex items-center gap-2 text-sm text-text">
                  <Paperclip className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                  <span className="truncate">{row.file.name}</span>
                  {row.status === "pending" ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : (
                    <>
                      <span className="text-xs text-danger">{row.error}</span>
                      <button
                        type="button"
                        aria-label={`Retry ${row.file.name}`}
                        onClick={() => retryRow(row.key)}
                        className="text-muted hover:text-text"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Dismiss ${row.file.name}`}
                        onClick={() => dismissRow(row.key)}
                        className="text-muted hover:text-danger"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {capReached ? (
            <p className="rounded-md border border-dashed border-muted/30 p-3 text-xs text-muted">
              This lesson has reached its 20MB attachment limit. Share a Google Drive link in the body, or compress/zip your files.
            </p>
          ) : (
            <StyledFileInput buttonLabel="Attach a file" onFileSelected={handleFileSelect} disabled={isPartialFailureSession} />
          )}
          {!capReached && <p className="text-xs text-muted">{formatBytes(Math.max(remainingBytes, 0))} remaining of 20MB for this lesson.</p>}
        </div>

        {mutation.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(mutation.error)}
          </p>
        )}

        <div className="flex justify-end gap-2">
          {isPartialFailureSession ? (
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Spinner className="mr-2" />}
                {isEdit ? "Save" : "Create"}
              </Button>
            </>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={deletingAttachment !== null}
        onClose={() => {
          setDeletingAttachment(null);
          deleteAttachment.reset();
        }}
        onConfirm={confirmDeleteAttachment}
        title="Delete attachment"
        description={deletingAttachment ? <>This removes <span className="font-semibold text-text">{deletingAttachment.fileName}</span> from this lesson.</> : undefined}
        confirmLabel="Delete"
        confirmTone="danger"
        isConfirming={deleteAttachment.isPending}
      >
        {deleteAttachment.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(deleteAttachment.error)}
          </p>
        )}
      </ConfirmDialog>
    </Dialog>
  );
}
