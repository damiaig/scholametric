import { useEffect, useRef, useState } from "react";
import type { RemarkAuthor } from "@scholametric/shared";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { formatDate } from "../../lib/format-date";
import { useCurrentUser } from "../shell/use-current-user";
import { useWriteTeacherRemark, useWritePrincipalRemark } from "./use-remarks";

interface RemarkPanelProps {
  label: string;
  studentId: string;
  termId: string;
  sessionId: string;
  remark: string | null;
  remarkBy: RemarkAuthor | null;
  remarkAt: string | null;
  // Hidden (not disabled) for a viewer who can't write this remark —
  // SPEC_V0.5.md §2.4/Q6, standing RBAC pattern. The read-only text above
  // still renders regardless — the read endpoint doesn't gate remarks by
  // role, only the write endpoints do.
  showForm: boolean;
  field: "teacher" | "principal";
}

// Both remark forms share this shape (only which mutation/copy differs) —
// SPEC_V0.5.md §2.4 step 6. Admin/proprietor can write EITHER remark (the
// backend allows it — a principal completing a card when the class teacher
// hasn't yet is the real workflow), so the copy below says "Teacher
// remark," never "write as the class teacher" — whoever saves it is
// stamped with THEIR own name, admin included.
export function RemarkPanel({ label, studentId, termId, sessionId, remark, remarkBy, remarkAt, showForm, field }: RemarkPanelProps) {
  const { data: currentUser } = useCurrentUser();
  const teacherMutation = useWriteTeacherRemark();
  const principalMutation = useWritePrincipalRemark();
  const mutation = field === "teacher" ? teacherMutation : principalMutation;

  const [text, setText] = useState(remark ?? "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Resync from a background refetch (the mutation's own invalidate, or
  // another viewer's edit) — never while this textarea is actively
  // focused, same "don't clobber in-progress typing" rule as ScoreEntryRow.
  useEffect(() => {
    if (document.activeElement !== textareaRef.current) {
      setText(remark ?? "");
    }
  }, [remark]);

  function handleSave() {
    if (!currentUser) return;
    mutation.mutate({
      studentId,
      input: { termId, sessionId, remark: text.trim() === "" ? null : text },
      authorName: { firstName: currentUser.firstName, lastName: currentUser.lastName },
    });
  }

  return (
    <div className="break-inside-avoid rounded-lg border border-muted/20 p-3">
      <p className="mb-1 font-medium text-text">{label}</p>
      {remark ? (
        <>
          <p className="whitespace-pre-wrap text-sm text-text">{remark}</p>
          {remarkBy && (
            <p className="mt-1 text-xs text-muted">
              — {remarkBy.firstName} {remarkBy.lastName}
              {remarkAt ? `, ${formatDate(remarkAt)}` : ""}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">No remark yet.</p>
      )}

      {showForm && (
        <div className="mt-3 flex flex-col gap-2 print:hidden">
          <Textarea
            ref={textareaRef}
            aria-label={label}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Write the ${field === "teacher" ? "teacher" : "principal"} remark…`}
            rows={3}
          />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={handleSave} disabled={mutation.isPending}>
              {mutation.isPending && <Spinner className="mr-2" />}
              Save
            </Button>
            {mutation.isSuccess && !mutation.isPending && <span className="text-xs text-success">Saved</span>}
          </div>
          {mutation.isError && <p className="text-xs text-danger">{getErrorMessage(mutation.error)}</p>}
        </div>
      )}
    </div>
  );
}
