import { useState } from "react";
import type { CloseTermResponse, Term } from "@scholametric/shared";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { getErrorMessage } from "../../lib/api-client";
import { useCloseTerm } from "./use-terms";

const TERM_LABELS: Record<string, string> = { FIRST: "First term", SECOND: "Second term", THIRD: "Third term" };

interface CloseTermDialogProps {
  term: Term | null;
  onClose: () => void;
}

// SPEC_V0.5.md §2.3/Q4, v0.5 step 5 — warn-but-allow. The breakdown of
// what's still unpublished only exists as the close endpoint's OWN
// response (there's no separate preview call — closing is a one-way
// action), so this is a two-phase dialog: confirm first, then — without
// closing — swap to a result view showing what the response returned.
export function CloseTermDialog({ term, onClose }: CloseTermDialogProps) {
  const closeTerm = useCloseTerm();
  const [result, setResult] = useState<CloseTermResponse | null>(null);

  function handleClose() {
    setResult(null);
    closeTerm.reset();
    onClose();
  }

  if (result) {
    return (
      <Dialog open onClose={handleClose} title="Term closed">
        <div className="flex flex-col gap-4 p-6">
          <div>
            <h2 className="text-lg font-semibold text-text">Term closed</h2>
            <p className="mt-1 text-sm text-muted">
              {TERM_LABELS[result.name] ?? result.name} is now read-only. Teachers need a principal/proprietor unlock to
              edit a specific class and subject.
            </p>
          </div>

          {result.unpublishedCount > 0 ? (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-text">
              <p>
                {result.unpublishedCount} result{result.unpublishedCount === 1 ? "" : "s"} across{" "}
                {result.unpublished.length} class/subject pair{result.unpublished.length === 1 ? "" : "s"}{" "}
                {result.unpublished.length === 1 ? "is" : "are"} still unpublished.
              </p>
              <p className="mt-1 text-xs text-muted">See Review &amp; Publish for exactly which classes and subjects.</p>
            </div>
          ) : (
            <p className="text-sm text-success">Everything was already published — nothing left pending.</p>
          )}

          <div className="mt-2 flex justify-end">
            <Button type="button" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <ConfirmDialog
      open={term !== null}
      onClose={onClose}
      onConfirm={() => {
        if (!term) return;
        closeTerm.mutate(term.id, { onSuccess: (data) => setResult(data) });
      }}
      title="Close term"
      description={
        term ? (
          <>
            This makes <span className="font-semibold text-text">{TERM_LABELS[term.name] ?? term.name}</span> read-only for
            teachers. Anything not yet published stays unpublished — you'll see exactly what's still pending once you
            confirm. A principal/proprietor can unlock a specific class and subject afterward if an edit is needed.
          </>
        ) : undefined
      }
      confirmLabel="Close term"
      confirmTone="danger"
      isConfirming={closeTerm.isPending}
    >
      {closeTerm.isError && (
        <p role="alert" className="text-sm text-danger">
          {getErrorMessage(closeTerm.error)}
        </p>
      )}
    </ConfirmDialog>
  );
}
