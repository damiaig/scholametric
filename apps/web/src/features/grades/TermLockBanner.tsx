import { useCallback, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { getErrorMessage } from "../../lib/api-client";
import { useUnlockTerm, useRelockTerm } from "../settings/use-terms";

interface TermLockBannerProps {
  termId: string;
  classArmId: string;
  subjectId: string;
  termClosed: boolean;
  locked: boolean;
  unlockReason: string | null;
  /** SCHOOL_ADMIN/PROPRIETOR — Unlock/Relock controls are HIDDEN, not disabled, for anyone else (TEACHER). */
  canManage: boolean;
}

// SPEC_V0.5.md §2.3, v0.5 step 5 — renders directly from the picker's own
// termClosed/locked/unlockReason (load-time, never reactive on a 409).
// Lives right on the grid the need arises on, not a separate settings
// screen — classArmId/subjectId/termId are already in context here.
export function TermLockBanner({ termId, classArmId, subjectId, termClosed, locked, unlockReason, canManage }: TermLockBannerProps) {
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [relockOpen, setRelockOpen] = useState(false);
  const [reason, setReason] = useState("");
  const unlockTerm = useUnlockTerm();
  const relockTerm = useRelockTerm();

  // Dialog's own focus-restore effect depends on [open, onClose] — an
  // inline arrow here would be a new reference on every keystroke into
  // the reason field below (any state change re-renders this component),
  // re-firing that effect and stealing focus back via its cleanup
  // (previouslyFocused?.focus()) after the FIRST character typed. Stable
  // identity via useCallback is required, not just tidiness.
  const closeUnlock = useCallback(() => {
    setUnlockOpen(false);
    setReason("");
  }, []);
  const closeRelock = useCallback(() => setRelockOpen(false), []);

  if (!termClosed) return null;

  if (locked) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-muted/30 bg-muted/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-sm text-text">
            This term is closed for this class and subject. Ask your principal/proprietor to unlock before editing.
          </p>
        </div>
        {canManage && (
          <Button type="button" size="sm" variant="outline" onClick={() => setUnlockOpen(true)}>
            Unlock
          </Button>
        )}

        <ConfirmDialog
          open={unlockOpen}
          onClose={closeUnlock}
          onConfirm={() =>
            unlockTerm.mutate(
              { termId, input: { classArmId, subjectId, reason } },
              {
                onSuccess: () => {
                  setUnlockOpen(false);
                  setReason("");
                },
              },
            )
          }
          title="Unlock this class and subject"
          description="Scores can be edited again for this exact class and subject until it's relocked — every edit is still recorded as usual."
          confirmLabel="Unlock"
          isConfirming={unlockTerm.isPending}
          confirmDisabled={reason.trim().length < 3}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unlock-reason">Reason</Label>
            <Input
              id="unlock-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Parent requested a correction"
              autoComplete="off"
            />
          </div>
          {unlockTerm.isError && (
            <p role="alert" className="text-sm text-danger">
              {getErrorMessage(unlockTerm.error)}
            </p>
          )}
        </ConfirmDialog>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Unlock className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sm text-text">
          Unlocked for editing — reason: <span className="italic">"{unlockReason}"</span>
        </p>
      </div>
      {canManage && (
        <Button type="button" size="sm" variant="outline" onClick={() => setRelockOpen(true)}>
          Relock
        </Button>
      )}

      <ConfirmDialog
        open={relockOpen}
        onClose={closeRelock}
        onConfirm={() => relockTerm.mutate({ termId, input: { classArmId, subjectId } }, { onSuccess: () => setRelockOpen(false) })}
        title="Relock this class and subject"
        description="Scores can no longer be edited for this class and subject until unlocked again."
        confirmLabel="Relock"
        isConfirming={relockTerm.isPending}
      >
        {relockTerm.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(relockTerm.error)}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
