import { useState } from "react";
import type { StaffUser } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useResetStaffPassword } from "./use-staff-users";
import { OneTimePasswordDisplay } from "./OneTimePasswordDisplay";

interface ResetPasswordDialogProps {
  user: StaffUser;
  open: boolean;
  onClose: () => void;
}

export function ResetPasswordDialog({ user, open, onClose }: ResetPasswordDialogProps) {
  const resetPassword = useResetStaffPassword();
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  function handleClose() {
    setTemporaryPassword(null);
    resetPassword.reset();
    onClose();
  }

  if (temporaryPassword) {
    return (
      <Dialog open={open} onClose={handleClose} title="Password reset">
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold text-text">
            New password for {user.firstName} {user.lastName}
          </h2>
          <OneTimePasswordDisplay password={temporaryPassword} />
          <div className="flex justify-end">
            <Button type="button" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Reset password">
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-text">Reset password</h2>
        <p className="text-sm text-muted">
          This generates a new temporary password for{" "}
          <span className="font-semibold text-text">
            {user.firstName} {user.lastName}
          </span>{" "}
          and signs them out of any other active session.
        </p>
        {resetPassword.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(resetPassword.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={resetPassword.isPending}
            onClick={() =>
              resetPassword.mutate(user.id, {
                onSuccess: (result) => setTemporaryPassword(result.temporaryPassword),
              })
            }
          >
            {resetPassword.isPending && <Spinner className="mr-2" />}
            Reset password
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
