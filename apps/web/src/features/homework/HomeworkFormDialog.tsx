import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Paperclip, X, RefreshCw } from "lucide-react";
import {
  homeworkFormSchema,
  HOMEWORK_ATTACHMENT_CAP_BYTES,
  type Homework,
  type HomeworkAttachment,
  type HomeworkFormInput,
} from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import { StyledDatePicker } from "../../components/ui/styled-date-picker";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateHomework, useUpdateHomework } from "./use-homework";
import { useAttachHomeworkFile, getAttachErrorMessage } from "./use-homework-attachments";

interface HomeworkFormDialogProps {
  open: boolean;
  onClose: () => void;
  classArmId: string;
  subjectId: string;
  termId: string;
  /** When set, edits this homework instead of creating a new one. */
  homework?: Homework | null;
}

interface AttachRow {
  key: string;
  file: File;
  status: "pending" | "error";
  error?: string;
}

const BLANK: HomeworkFormInput = { title: "", description: "", dueDate: "", requiresUpload: false };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// v0.8.3 step 2 (SPEC_V0.8.3.md §2.1, Item 1) — attachments move INTO this
// form; the separate "Attachments & submissions" dialog (HomeworkDetailDialog)
// now shows submissions only. Two different attach behaviors depending on
// whether a homework id already exists:
//   - EDIT mode (homework.id known) and the post-partial-failure state
//     below (createdHomeworkId known): selecting a file attaches it
//     IMMEDIATELY, reusing useAttachHomeworkFile exactly as the old detail
//     dialog did.
//   - CREATE mode (no id yet): a file can't be attached before the
//     homework exists (the storage key embeds homeworkId), so selected
//     files are HELD client-side (heldFiles) and attached, sequentially,
//     only after the create POST succeeds — see onSubmit.
//
// Deliberately NOT deriving `homework` live-by-id in the parent to show
// newly-attached files here — that would re-key this component's own
// reset() effect on every list refetch (an attach success invalidates the
// list query) and wipe any unsaved title/description edits back to the
// refetched values, the same stale-snapshot bug class the v0.8.2 bugfix
// pass already fixed once for the OLD detail dialog. Instead,
// sessionAttachments is a local array appended to directly from each
// attach mutation's own return value (already in hand, no refetch
// involved) — `homework` stays the frozen snapshot it always was, and the
// reset effect is keyed on `open` alone, not on `homework`'s identity.
export function HomeworkFormDialog({ open, onClose, classArmId, subjectId, termId, homework }: HomeworkFormDialogProps) {
  const isEdit = homework != null;
  const createHomework = useCreateHomework();
  const updateHomework = useUpdateHomework();
  const attachFile = useAttachHomeworkFile();
  const mutation = isEdit ? updateHomework : createHomework;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [heldFiles, setHeldFiles] = useState<File[]>([]);
  const [sessionAttachments, setSessionAttachments] = useState<HomeworkAttachment[]>([]);
  const [attachRows, setAttachRows] = useState<AttachRow[]>([]);
  const [createdHomeworkId, setCreatedHomeworkId] = useState<string | null>(null);

  // Set once a create-then-attach submit hits a partial failure (some
  // files attached, at least one didn't) — the dialog stays open, acting
  // as an edit session for the homework that DOES now exist, without
  // rolling it back.
  const isPartialFailureSession = !isEdit && createdHomeworkId !== null;
  const targetHomeworkId = homework?.id ?? createdHomeworkId;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<HomeworkFormInput>({
    resolver: zodResolver(homeworkFormSchema),
    defaultValues: BLANK,
  });

  // Keyed on `open` ALONE, not on `homework` — see the component doc
  // comment above for why re-keying on `homework`'s identity would wipe
  // unsaved edits whenever an attach success invalidates the list query.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      reset(
        homework
          ? { title: homework.title, description: homework.description, dueDate: homework.dueDate, requiresUpload: homework.requiresUpload }
          : BLANK,
      );
      setHeldFiles([]);
      setSessionAttachments([]);
      setAttachRows([]);
      setCreatedHomeworkId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const committedAttachments = [...(homework?.attachments ?? []), ...sessionAttachments];
  const usedBytes =
    committedAttachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0) + heldFiles.reduce((sum, file) => sum + file.size, 0);
  const remainingBytes = HOMEWORK_ATTACHMENT_CAP_BYTES - usedBytes;
  const capReached = remainingBytes <= 0;

  async function attachOneFile(file: File, homeworkId: string): Promise<boolean> {
    const key = `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`;
    setAttachRows((rows) => [...rows, { key, file, status: "pending" }]);
    try {
      const result = await attachFile.mutateAsync({ homeworkId, file });
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
    if (!row || !targetHomeworkId) return;
    setAttachRows((rows) => rows.filter((r) => r.key !== key));
    void attachOneFile(row.file, targetHomeworkId);
  }

  function dismissRow(key: string) {
    setAttachRows((rows) => rows.filter((row) => row.key !== key));
  }

  function removeHeldFile(index: number) {
    setHeldFiles((files) => files.filter((_, i) => i !== index));
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (targetHomeworkId) {
      void attachOneFile(file, targetHomeworkId);
    } else {
      setHeldFiles((files) => [...files, file]);
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    if (isEdit && homework) {
      updateHomework.mutate({ id: homework.id, input: values }, { onSuccess: () => onClose() });
      return;
    }

    let created: Homework;
    try {
      created = await createHomework.mutateAsync({ ...values, classArmId, subjectId, termId });
    } catch {
      return; // mutation.isError/mutation.error already set for rendering below
    }

    if (heldFiles.length === 0) {
      onClose();
      return;
    }

    setCreatedHomeworkId(created.id);
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
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit homework" : "New homework"}>
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">{isEdit ? "Edit homework" : "New homework"}</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="homework-title">Title</Label>
          <Input id="homework-title" placeholder="e.g. Chapter 3 exercises" disabled={isPartialFailureSession} {...register("title")} />
          <FieldError message={errors.title?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="homework-description">Description</Label>
          <Textarea
            id="homework-description"
            placeholder="What students need to do"
            disabled={isPartialFailureSession}
            {...register("description")}
          />
          <FieldError message={errors.description?.message} />
        </div>

        {/* Not disabled during the partial-failure session below like the other fields —
            StyledDatePicker has no disabled prop, and it's harmless here regardless: its own
            input is already readOnly (picking a date only updates local form state), and the
            submit button that would act on that state is gone in this state. */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="homework-due-date">Due date</Label>
          <Controller
            name="dueDate"
            control={control}
            render={({ field }) => (
              <StyledDatePicker id="homework-due-date" value={field.value} onChange={field.onChange} minDate="today" placeholder="Select a date…" />
            )}
          />
          <FieldError message={errors.dueDate?.message} />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="homework-requires-upload" disabled={isPartialFailureSession} {...register("requiresUpload")} />
          <Label htmlFor="homework-requires-upload">Requires a file upload from students</Label>
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
              This homework has reached its 20MB attachment limit. Share a Google Drive link in the description, or compress/zip your files.
            </p>
          ) : (
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              disabled={isPartialFailureSession}
              className="text-sm text-text"
            />
          )}
          {!capReached && <p className="text-xs text-muted">{formatBytes(Math.max(remainingBytes, 0))} remaining of 20MB for this homework.</p>}
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
    </Dialog>
  );
}
